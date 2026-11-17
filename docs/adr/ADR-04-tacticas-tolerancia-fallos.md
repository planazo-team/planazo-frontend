# ADR-04: Tácticas de tolerancia a fallos (Circuit Breaker, reintentos idempotentes y reconexión con RESUME)

* **Estado:** Aceptado
* **Fecha:** 2026-11-15
* **Responsable:** Juan Diego Melo (P1 — Disponibilidad) y Diego Andrade (P2)
* **Escenarios asociados:** ESC-04 (Disponibilidad)

---

## Contexto

En un sistema distribuido con cinco microservicios, una caída parcial o lentitud transitoria en una réplica de `booking`, `promo` o `realtime` no debe propagarse en cascada ni dejar al navegador colgado esperando respuestas indefinidamente. Asimismo, las desconexiones momentáneas de WebSocket no deben obligar al usuario a recargar la página ni perder eventos ocurridos durante el corte.

---

## Decisión

Combinar cuatro tácticas arquitectónicas de disponibilidad y recuperación (Bass, Clements & Kazman):

1. **Circuit Breaker por servicio destino (`opossum` en `api-gateway`):**
   - Cada upstream (`booking`, `promo`, `game`) está protegido por un Circuit Breaker con `timeout: 5000 ms`, `errorThresholdPercentage: 50` y `resetTimeout: 10000 ms`.
   - Cuando el circuito se abre o el servicio no responde, el gateway falla rápido con `503 Service Unavailable` (`{ code: 'SERVICIO_NO_DISPONIBLE', message }`) en lugar de agotar los hilos del gateway.
2. **Reintentos automáticos exclusivamente en lecturas idempotentes (`GET`):**
   - En `forward.ts`, las peticiones `GET` se reintentan automáticamente hasta 2 veces con backoff (`150 ms`) si una réplica falla justo en el instante del cambio de rotación.
   - Las operaciones `POST`, `PATCH` y `DELETE` **nunca** se reintentan automáticamente en el proxy para evitar efectos duplicados.
3. **Detección activa y reemplazo de réplicas (`planazo-balancer` + Railway):**
   - Los balanceadores propios verifican `/health` y sacan de rotación cualquier instancia caída; Railway aplica `restartPolicyType: ON_FAILURE` para levantar el contenedor de nuevo.
4. **Reconexión WebSocket con backoff exponencial y `RESUME` (`realtime`):**
   - El cliente de `realtime` (`frontend/src/lib/realtime/client.ts`) reconecta con backoff exponencial, conserva el último `seq` recibido y envía `RESUME { lastSeq }` para recibir por `REPLAY` únicamente los eventos perdidos sin duplicados ( deduplicación por `id`).

---

## Consecuencias

### Positivas
* **Aislamiento de fallos (Bulkhead & Fail-fast):** Si un microservicio falla, el resto de la aplicación sigue respondiendo y la interfaz muestra mensajes claros en español.
* **Cero errores percibidos en lecturas durante caídas de una réplica:** El reintento en `GET` junto con el balanceador absorbe la caída de una instancia en caliente.
* **Continuidad en tiempo real:** Al caer una réplica de `realtime`, los clientes reconectan a la réplica sana y recuperan la secuencia exacta de eventos.

### Negativas y mitigaciones
* **Latencia máxima en fallo total:** Cuando todas las réplicas de un servicio caen por primera vez, las peticiones esperan hasta el timeout (`5 s`) antes de abrir el circuito. Una vez abierto, las respuestas `503` son inmediatas (< 2 ms) durante la ventana de `resetTimeout`.
