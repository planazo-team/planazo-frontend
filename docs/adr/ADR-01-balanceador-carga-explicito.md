# ADR-01: Balanceadores de carga explícitos con round-robin y healthcheck activo

* **Estado:** Aceptado
* **Fecha:** 2026-11-04
* **Responsable:** Juan Diego Melo (P1 — Disponibilidad y Rendimiento)
* **Escenarios asociados:** ESC-04 (Disponibilidad), ESC-06 (Rendimiento)

---

## Contexto

El escenario ESC-04 exige que la arquitectura de Planazo soporte múltiples réplicas de sus servicios críticos (`api-gateway`, `booking`, `promo`, `realtime`), reparta la carga de forma equitativa y retire automáticamente de rotación cualquier instancia caída en menos de 10 segundos sin afectar las peticiones en curso (tasa de error < 1 % bajo prueba de caos con 100 usuarios concurrentes).

En Railway (plan Hobby), el enrutamiento DNS interno por defecto o un único contenedor sin balanceador explícito no expone métricas detalladas por backend ni permite demostrar de forma transparente el algoritmo de reparto, el conteo de peticiones atendidas por réplica (`booking-a` / `booking-b`, `promo-a` / `promo-b`) ni la conmutación ante fallos en el panel `/estado`.

---

## Decisión

Desplegar balanceadores de carga dedicados (`planazo-balancer`: `lb-gateway`, `lb-booking`, `lb-promo`, `lb-realtime`) delante de las réplicas de los microservicios y exponer el identificador de réplica en cada respuesta HTTP.

1. **Algoritmo y chequeo de salud activo:**
   - Reparto **round-robin** entre las instancias registradas en `BACKENDS`.
   - Sondeo periódico contra `GET /health` de cada réplica; si una réplica falla o deja de responder (por ejemplo, al activar `POST /api/caos/apagar`), el balanceador la marca como `sano: false` y redirige inmediatamente el tráfico hacia las réplicas sanas restantes.
2. **Sin `keep-alive` en llamadas internas (`forward.ts`):**
   - El `api-gateway` utiliza un `http.Agent({ keepAlive: false })` hacia los servicios internos para garantizar que cada petición sea distribuida por el balanceador y no quede fijada a un único socket TCP persistente.
3. **Trazabilidad de réplica (`x-served-by` y `x-upstream-served-by`):**
   - Cada servicio añade el header `x-served-by: <servicio>@<replica>` y el gateway propaga `x-upstream-served-by`, permitiendo verificar en `/estado` y en los scripts k6 el reparto real 50/50 entre instancias.

---

## Consecuencias

### Positivas
* **Tolerancia a fallos verificable:** Al apagar una réplica en vivo desde `/estado`, el tráfico conmuta a la réplica sobreviviente sin errores visibles para el usuario.
* **Observabilidad en tiempo real:** El endpoint `/api/health/cluster` y los balanceadores reportan peticiones atendidas, conexiones activas y estado de salud de cada réplica.
* **Cero bloqueo entre servicios:** Se evita que una réplica degradada acapare conexiones abiertas.

### Negativas y mitigaciones
* **Salto adicional de red interna:** Pasar por el balanceador interno añade ~1–2 ms de latencia dentro de la red privada de Railway (`*.railway.internal`), lo cual es despreciable frente al presupuesto de latencia (p95 < 300 ms).
