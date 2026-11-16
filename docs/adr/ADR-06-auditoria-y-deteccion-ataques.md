# ADR-06: Bitácora de auditoría inmutable y detección distribuida de ataques con Redis

* **Estado:** Aceptado
* **Fecha:** 2026-11-15
* **Responsable:** Diego Fabián Andrade Durán (P2 — Seguridad)
* **Escenarios asociados:** ESC-03

---

## Contexto

El escenario ESC-03 (*Seguridad: Detección de ataques y trazabilidad*) exige que la arquitectura de Planazo sea capaz de:
1. Detectar scripts automatizados y ataques de fuerza bruta o escaneo provenientes de una misma dirección IP que generen más de 50 respuestas de error (códigos HTTP 401 Unauthorized o 429 Too Many Requests) en una ventana de 1 minuto.
2. Bloquear automáticamente a la IP agresora durante 10 minutos sin degradar el servicio ni afectar a los usuarios legítimos concurrentes.
3. Emitir una alerta visible para el tablero técnico de observabilidad en menos de 60 segundos.
4. Mantener una bitácora de auditoría (`audit_log`) inalterable (append-only) de todas las operaciones sensibles del negocio (inicios de sesión, creación/edición de promociones, alteración de cupos/capacidad de lugares, reclamos de cupones y cancelaciones de reservas), garantizando trazabilidad completa con IP, usuario y correlation-id.

Al tener múltiples instancias de `api-gateway` detrás de un balanceador de carga, el conteo de errores y el estado de bloqueo no pueden residir de forma aislada en la memoria local de cada proceso, ya que las peticiones del atacante se distribuyen entre las réplicas.

---

## Decisión

Implementar un mecanismo coordinado de detección en el borde con **Redis** como almacén compartido de estado efímero y una **bitácora de auditoría append-only**.

1. **Detección de ataques distribuida en Redis:**
   - En el API Gateway, un middleware intercepta el evento de finalización de respuesta (`res.finish`).
   - Ante códigos de error 401 y 429, se incrementa de forma atómica la llave `ip:err4xx:<ip>` con comando `INCR` y expiración `EX 60` (ventana deslizante de 1 minuto).
   - Al superar el umbral de 50 errores, se establece la llave `ip:blocked:<ip>` con un TTL de 600 segundos (10 minutos).
   - Se emite de inmediato un log estructurado de seguridad con formato unificado: `[ALERTA_SEGURIDAD] Ataque detectado: IP <ip> bloqueada por 10 minutos tras registrar >50 errores 401/429 en 1 minuto.` para su recolección hacia el tablero técnico de observabilidad.
   - Peticiones subsiguientes de la IP bloqueada son cortadas en el borde del gateway con `429 Too Many Requests` (`code: IP_BLOQUEADA`) antes de invocar cualquier microservicio aguas abajo.

2. **Bitácora de auditoría append-only:**
   - Se auditan exclusivamente operaciones que modifican el estado del negocio o la sesión:
     - `INICIO_SESION` (`POST /api/auth/google`, `POST /api/auth/demo`)
     - `REGISTRO_NEGOCIO` (`POST /api/auth/negocio/registro`)
     - `CAMBIO_MODO` (`POST /api/auth/modo`)
     - `CREAR_LUGAR` (`POST /api/auth/negocio`, `POST /api/places`)
     - `CREAR_PROMO` (`POST /api/promos`)
     - `EDITAR_PROMO` (`PATCH /api/promos/:id`)
     - `CAMBIAR_CAPACIDAD` (`PATCH /api/places/:id/slots/:sid`)
     - `RECLAMAR_CUPON` (`POST /api/promos/:id/reclamar`)
     - `CREAR_RESERVA` (`POST /api/reservations`)
     - `CANCELAR_RESERVA` (`DELETE /api/reservations/:id`)
   - Cada entrada contiene: `id` (UUID v4), `at` (epoch ms), `userId` (sujeto autenticado o anónimo), `action`, `ip`, `correlationId` (del header `x-correlation-id`) y `details` (método, ruta, status).
   - En base de datos se revoca explícitamente cualquier permiso de `UPDATE` o `DELETE` al rol de la aplicación sobre la tabla `booking.audit_log`, asegurando inmutabilidad.

---

## Consecuencias

### Positivas
* **Coordinación multi-instancia:** Las réplicas del gateway comparten el estado de conteo y bloqueo en Redis; si una IP ataca a través de diferentes instancias, el bloqueo se activa globalmente.
* **Resiliencia con degradación elegante:** Si Redis no estuviera accesible temporalmente, el detector conmuta automáticamente a un registro en memoria local sin interrumpir el enrutamiento del gateway.
* **Trazabilidad forense inalterable:** Los registros de auditoría permiten reconstruir incidentes de seguridad y validar la autenticidad de transacciones críticas.
* **Bajo impacto de rendimiento:** Las comprobaciones en Redis son consultas O(1) en memoria que añaden < 1 ms de latencia a las peticiones entrantes.

### Negativas y mitigaciones
* **Dependencia de Redis:** Si Redis se satura, las operaciones de conteo podrían ralentizarse.
  * *Mitigación:* Se configuran timeouts agresivos (máx. 1 reintento, `lazyConnect`) y el detector no bloquea el ciclo de vida de la petición si la conexión a Redis se interrumpe.
