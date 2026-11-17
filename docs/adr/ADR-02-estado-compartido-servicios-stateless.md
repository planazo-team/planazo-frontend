# ADR-02: Estado compartido en PostgreSQL y Redis con microservicios stateless

* **Estado:** Aceptado
* **Fecha:** 2026-11-05
* **Responsable:** Juan Diego Melo (P1 — Disponibilidad y Rendimiento)
* **Escenarios asociados:** ESC-04 (Disponibilidad), ESC-06 (Rendimiento)

---

## Contexto

Para escalar horizontalmente `api-gateway`, `booking`, `promo` y `realtime` a 2 o más réplicas simultáneas detrás de los balanceadores (ADR-01), ningún microservicio puede depender de estructuras en memoria local (`Map`, arreglos o contadores de proceso) como fuente de verdad para reservas, stock de cupones, secuencia de eventos o límites de tasa. Si el estado residiera en la RAM de una réplica:
1. Dos clientes atendidos por réplicas distintas verían disponibilidades distintas y provocarían sobreventas (rompiendo CC-3 y CC-1).
2. Un cliente que se reconecta a otra réplica de `realtime` recibiría números de secuencia (`seq`) inconsistentes (rompiendo RT-2).
3. El reinicio de un contenedor borraría reservas y promociones activas.

---

## Decisión

Extraer todo el estado mutable de negocio y de coordinación hacia **PostgreSQL** (persistencia transaccional y secuencias) y **Redis** (contadores atómicos, caché, bloqueos de seguridad y bus pub/sub), dejando las réplicas de los microservicios completamente **stateless**.

1. **`booking` en PostgreSQL (esquema `booking`):**
   - Control de concurrencia optimista (CC-3) en una sola sentencia atómica SQL (`UPDATE time_slots SET taken = taken + $people, version = version + 1 WHERE id = $slotId AND version = $clientVersion AND capacity - taken >= $people`), válida sin importar qué réplica ejecute la transacción.
2. **`promo` en Redis + PostgreSQL (esquema `promo`):**
   - El descuento de stock finito (CC-1) y la validación de un cupón por usuario se ejecutan mediante un script **Lua atómico en Redis**, compartido por todas las réplicas de `promo`.
3. **`realtime` con secuencia global en PostgreSQL y fan-out por Redis:**
   - El número de secuencia global (`seq`) proviene de PostgreSQL (`event_log`) y cada réplica de `realtime` se suscribe al canal Redis `planazo.events` para difundir a sus clientes WebSocket conectados y responder `RESUME`/`REPLAY` desde la base compartida.
4. **Estado perimetral en Redis (`api-gateway`):**
   - Los contadores de ataques por IP (`ip:err4xx:<ip>`, `ip:blocked:<ip>`) se almacenan en Redis para que el bloqueo aplique en todas las réplicas del gateway.

---

## Consecuencias

### Positivas
* **Invariantes de concurrencia intactos al escalar:** CC-1 (cero cupones de más) y CC-3 (cero sobreventas) se cumplen exactamente igual con 1, 2 o $N$ réplicas.
* **Reconexión transparente (RT-2):** Un cliente WebSocket puede hacer `RESUME` contra cualquier réplica de `realtime` y recibir los eventos faltantes en orden estricto.
* **Despliegues y reinicios sin pérdida de datos:** Las reservas, lugares, cuentas de negocio y cupones sobreviven a redespliegues y pruebas de caos.

### Negativas y mitigaciones
* **Punto común en PostgreSQL y Redis:** La disponibilidad de escritura depende del motor gestionado de Postgres y Redis en Railway.
  * *Mitigación:* Se aplican timeouts cortos, pool de conexiones acotado y Circuit Breaker en el gateway (ADR-04).
