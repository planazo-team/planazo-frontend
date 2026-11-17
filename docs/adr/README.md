# Architecture Decision Records (ADRs) — Planazo (Sprint 2)

Decisiones arquitectónicas que sustentan los 7 escenarios de calidad de Planazo (Disponibilidad, Rendimiento, Seguridad, Mantenibilidad y Observabilidad):

| ADR | Título | Atributo / Escenario | Responsable | Estado |
|---|---|---|---|---|
| [`ADR-01`](ADR-01-balanceador-carga-explicito.md) | Balanceadores de carga explícitos con round-robin y healthcheck activo | Disponibilidad (ESC-04) | Juan Diego Melo (P1) | Aceptado |
| [`ADR-02`](ADR-02-estado-compartido-servicios-stateless.md) | Estado compartido en PostgreSQL y Redis con microservicios stateless | Disponibilidad y Rendimiento (ESC-04, ESC-06) | Juan Diego Melo (P1) | Aceptado |
| [`ADR-03`](ADR-03-escalabilidad-minijuego.md) | Escalabilidad del Minijuego mediante autoridad en memoria por sala y marcador atómico en Redis | Disponibilidad y Rendimiento (ESC-04, ESC-06) | Juan Diego Melo (P1) / Diego Rozo (P3) | Aceptado |
| [`ADR-04`](ADR-04-tacticas-tolerancia-fallos.md) | Tácticas de tolerancia a fallos (Circuit Breaker, reintentos idempotentes y reconexión con RESUME) | Disponibilidad (ESC-04) | Juan Diego Melo (P1) / Diego Andrade (P2) | Aceptado |
| [`ADR-05`](ADR-05-jwt-stateless.md) | Autenticación y autorización stateless mediante JWT compartido | Seguridad (ESC-01, ESC-02) | Diego Andrade (P2) | Aceptado |
| [`ADR-06`](ADR-06-auditoria-y-deteccion-ataques.md) | Bitácora de auditoría inmutable y detección distribuida de ataques con Redis | Seguridad (ESC-03) | Diego Andrade (P2) | Aceptado |
| [`ADR-07`](ADR-07-observabilidad-prometheus-grafana.md) | Observabilidad unificada con Prometheus, Grafana, logs JSON y trazabilidad por correlation-id | Observabilidad (ESC-07) | Diego Rozo (P3) | Aceptado |
