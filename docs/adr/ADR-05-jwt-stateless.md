# ADR-05: Autenticación y autorización stateless mediante JWT compartido

* **Estado:** Aceptado
* **Fecha:** 2026-11-14
* **Responsable:** Diego Fabián Andrade Durán (P2 — Seguridad)
* **Escenarios asociados:** ESC-01, ESC-02

---

## Contexto

Planazo está diseñado como una arquitectura de microservicios distribuida con múltiples instancias desplegadas detrás de un balanceador de carga Nginx en Railway (`api-gateway`, `booking`, `promo`, `realtime`, `game`). 

El manejo tradicional de sesiones mediante estado en memoria en el servidor (`express-session`, JSESSIONID o sesiones fijadas por afinidad de IP / sticky sessions) presenta serias limitaciones arquitectónicas para nuestros atributos de calidad:
1. **Disponibilidad y escalamiento horizontal:** Cualquier instancia debe poder atender cualquier petición sin necesidad de sincronizar sesiones en memoria ni perder el estado del usuario ante la caída o reinicio de una réplica.
2. **Latencia y acoplamiento:** Los servicios satélites no deben realizar llamadas HTTP síncronas hacia un servicio central de identidad para verificar si una sesión es válida en cada petición.
3. **Consistencia en tiempo real:** El microservicio `game` (Spring Boot / WebSocket STOMP) requiere validar la identidad del jugador en el frame `CONNECT` y asegurar que un jugador no pueda suplantar a otro en salas concurrentes.

---

## Decisión

Adoptar un esquema de autenticación y autorización **completamente stateless basado en JSON Web Tokens (JWT) con firma simétrica HMAC-SHA256 (HS256)** compartida de alta entropía (`JWT_SECRET` ≥ 32 caracteres).

1. **Emisión centralizada en el API Gateway:**
   - La identidad se delega en Google OpenID Connect (`POST /api/auth/google`) validando la firma del ID Token con las llaves públicas de Google.
   - El API Gateway es el **único** componente autorizado para emitir y firmar los JWTs de Planazo.
   - El payload del JWT incluye los claims mínimos y suficientes: `sub` (identificador único), `name`, `nombre`, `role` (`cliente` o `negocio`) y `placeId` (opcional, establecimiento administrado).

2. **Propagación interna y confianza:**
   - Para servicios internos en la red privada (`booking`, `promo`), el gateway valida el JWT y propaga los claims mediante headers confiables (`x-user-id`, `x-user-role`, `x-user-place-id`), firmando la petición con `x-gateway-key`.
   - Para servicios con acceso directo o WebSocket público (`realtime`, `game`), cada servicio valida autónomamente la firma y expiración del JWT utilizando el secreto compartido (`JWT_SECRETO`), sin llamar al gateway.

3. **Autorización granular en Minijuego:**
   - `game` implementa Spring Security OAuth2 Resource Server para endpoints REST y un canal interceptor (`StompAuthChannelInterceptor`) para STOMP.
   - Cada operación verifica estrictamente que el sujeto del token coincida con el actor (`jugadorId == jwt.sub`), rechazando con `403 Forbidden` cualquier intento de suplantación antes de alcanzar la capa de dominio.

---

## Consecuencias

### Positivas
* **Escalabilidad horizontal sin fricción:** Al no existir sesiones en memoria, cualquier réplica del gateway o de los servicios backend puede procesar cualquier petición indistintamente.
* **Baja latencia:** La verificación de firma criptográfica local se ejecuta en menos de 2 ms, eliminando round-trips de red hacia bases de datos de sesión.
* **Tolerancia a fallos:** Si una instancia del backend se apaga o reinicia, los clientes continúan operando con sus tokens válidos sin cierres de sesión forzados.
* **Alineación con tácticas de seguridad:** Cumple la táctica de *Autorizar actores* mediante control de acceso stateless y desacoplado.

### Negativas y mitigaciones
* **Revocación inmediata de tokens:** Los JWTs emitidos son válidos hasta su expiración.
  * *Mitigación:* Se fijó una expiración acotada para tokens de producción. En caso de filtración de credenciales o secreto, se rota `JWT_SECRET` en Railway, invalidando instantáneamente todos los tokens previos en toda la flota.
