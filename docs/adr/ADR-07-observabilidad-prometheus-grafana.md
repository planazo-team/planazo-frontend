# ADR-07: Observabilidad unificada con Prometheus, Grafana, logs JSON y trazabilidad por correlation-id

* **Estado:** Aceptado
* **Fecha:** 2026-11-11
* **Responsable:** Diego Rozo (P3 — Observabilidad)
* **Escenarios asociados:** ESC-07 (Observabilidad), ESC-03 (Seguridad)

---

## Contexto

El escenario ESC-07 exige diagnosticar cuellos de botella, caídas de réplicas y alertas de seguridad en menos de 60 segundos, además de separar claramente un **tablero técnico** (latencia HTTP p50/p95, latencia de eventos en tiempo real, CPU/memoria por instancia, estado up/down, errores 4xx/5xx) y un **tablero de negocio** (usuarios activos, sesiones por modo cliente/negocio, reservas por zona, cupones reclamados vs. stock, partidas jugadas y consultas al agente).

Con múltiples réplicas desplegadas en contenedores efímeros, revisar logs en texto libre por consola hace imposible reconstruir el recorrido de una petición que atraviesa `frontend` → `api-gateway` → `lb-booking` → `booking` → `redis` → `realtime`.

---

## Decisión

Adoptar el stack **Prometheus + Grafana** para métricas técnicas y de negocio, junto con **logs estructurados en JSON** y propagación de **`x-correlation-id`** de punta a punta:

1. **Métricas de aplicación y de negocio (`/metrics`):**
   - Los servicios en Node.js (`api-gateway`, `booking`, `promo`, `realtime`) instrumentan histogramas y contadores con `prom-client` (latencia HTTP por ruta/status, sesiones emitidas por rol, usuarios activos, reservas, reclamos de promos, conexiones WS activas y latencia de entrega de eventos).
   - `planazo-game` (Spring Boot) expone métricas vía **Micrometer + Spring Boot Actuator Prometheus** (`/actuator/prometheus`).
2. **Recolección y visualización en Grafana (`planazo-infra/observabilidad/`):**
   - Prometheus recolecta periódicamente las métricas de todas las instancias etiquetadas por servicio y réplica (`replica`).
   - Se provisionan automáticamente dos tableros en Grafana (`dashboard-tecnico.json` y `dashboard-negocio.json`) y reglas de alerta (`alert_rules.yml`) para: tasa de error > 5 %, instancia caída, latencia RT p95 > 300 ms y ataque detectado.
3. **Trazabilidad extremo a extremo con `x-correlation-id`:**
   - El frontend genera un `X-Correlation-Id` (`plz-...`) en cada acción autenticada; el gateway lo valida o genera un UUID v4 en `accessLog`, lo incluye en `AuditLogService` (junto con `uid`, `rol` y `placeId`), lo propaga por HTTP a `booking`, `promo` y `game`, y lo devuelve en `x-request-id`.
4. **Panel en vivo `/estado` en la aplicación:**
   - Además de Grafana, el frontend incluye la página pública `/estado` conectada a `/api/health/cluster` para visualizar en vivo el reparto de los balanceadores y ejecutar la prueba de caos durante la demostración.

---

## Consecuencias

### Positivas
* **Correlación inmediata de incidentes:** Cualquier operación o intento de acceso denegado por rol (`ACCESO_DENEGADO_ROL`) puede rastrearse desde el navegador hasta el microservicio interno con un único `correlationId`.
* **Visibilidad de negocio y técnica sin impacto de rendimiento:** El modelo *pull* de Prometheus sobre contadores en memoria no añade latencia a las transacciones de los usuarios.

### Negativas y mitigaciones
* **Protección del endpoint de métricas:** Exponer métricas internas públicamente podría revelar información operativa.
  * *Mitigación:* Los servicios internos (`booking`, `promo`) corren en la red privada de Railway y los logs nunca incluyen secretos, contraseñas ni tokens JWT.
