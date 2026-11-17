# Planazo — estado de la aplicación

Foto del sistema al **16 de noviembre de 2026** (cierre del Sprint 2 — atributos de calidad). El detalle de cada servicio está en [`contexto.md`](contexto.md), las decisiones arquitectónicas en [`adr/`](adr/README.md) y el modelo de seguridad en [`seguridad.md`](seguridad.md).

## Resumen

Los cinco servicios, los balanceadores propios y el frontend están en producción y **cumplen los 6 retos funcionales más los 7 escenarios de calidad del Sprint 2 (ESC-01 a ESC-07)**:

- **Seguridad (ESC-01, ESC-02, ESC-03):**
  - Autenticación delegada **únicamente con Google** (el gateway verifica el ID token: firma, emisor, audiencia, vencimiento y correo verificado), más **verificación en dos pasos (2FA / TOTP con QR)** para el panel del negocio.
  - Autorización estricta por rol (`cliente` | `negocio`) y por establecimiento (`placeId`) tanto en el `api-gateway` (`role-auth.ts`) como en el frontend (`autorizacion.ts`).
  - Bitácora de auditoría (`AuditLogService`, líneas `[AUDIT_LOG]` en el log del gateway; la tabla durable `audit_log` sigue pendiente) con `userId`, `role`, `placeId`, `ip` y `correlationId`, más detector distribuido de ataques (`AttackDetector` en Redis) que bloquea por 10 minutos IPs con >50 errores `401/429` en 1 minuto.
- **Disponibilidad y Escalabilidad (ESC-04):**
  - Balanceadores propios (`planazo-balancer`: `lb-booking`, `lb-promo`, `lb-gateway`, `lb-realtime`) con algoritmo *round-robin* y healthcheck activo sobre múltiples réplicas (`booking-a`/`booking-b`, `promo-a`/`promo-b`).
  - Circuit Breaker (`opossum`) en el gateway con reintentos automáticos en lecturas `GET` idempotentes y respuesta `503 SERVICIO_NO_DISPONIBLE`.
  - Panel en vivo `/estado` con visualización de réplicas y botón de prueba de caos (`POST /api/health/caos`).
- **Mantenibilidad e Inspección Continua (ESC-05):**
  - Integración con **SonarCloud** en los flujos de GitHub Actions (`ci.yml`) de todos los repositorios, con cobertura superior al **80 %** (SonarCloud, 16 nov: `planazo-frontend` **92,4 %**, `planazo-api-gateway` **89,7 %**).
- **Rendimiento en Tiempo Real (ESC-06):**
  - Estado compartido en PostgreSQL y Redis, pruebas de carga con k6 HTTP y WebSocket (`planazo-infra/k6/`) y marcador atómico del minijuego con `ZINCRBY` en Redis.
- **Observabilidad (ESC-07):**
  - Logs estructurados en JSON con `x-request-id` y `x-correlation-id` de punta a punta, métricas Prometheus (`/metrics` y `/actuator/prometheus`) y tableros técnicos y de negocio en Grafana (`planazo-infra/observabilidad/`).

## Producción

| Pieza | Dónde | URL | Estado |
|---|---|---|---|
| **frontend** | Vercel (`planazo-frontend`, Root Directory `frontend`) | https://planazo-frontend.vercel.app | `live` contra el clúster en Railway; se entra únicamente con Google. Cada merge a `main` despliega automáticamente. |
| **api-gateway** | Railway, dominio público (con réplicas) | https://planazo-api-gateway-production.up.railway.app | Verifica el ID token de Google, firma el JWT HS256, valida RBAC (`cliente` \| `negocio` + `placeId`), Circuit Breaker (`opossum`), auditoría, detector de ataques y métricas Prometheus. |
| **lb-booking + booking** | Railway, red privada (`booking-a`, `booking-b`) | `http://lb-booking.railway.internal:8080` | 2 réplicas detrás de balanceador round-robin. Persistencia en PostgreSQL (esquema `booking`), CC-3 con lock optimista, cuentas, NIT y secretos 2FA. |
| **lb-promo + promo** | Railway, red privada (`promo-a`, `promo-b`) | `http://lb-promo.railway.internal:8080` | 2 réplicas detrás de balanceador round-robin. Stock y reclamo atómico en Redis (Lua, CC-1) + PostgreSQL (esquema `promo`), bonos exclusivos para ganadores del minijuego. |
| **realtime** | Railway, dominio público | `wss://planazo-realtime-production.up.railway.app/ws` | AUTH, SUBSCRIBE, RESUME, REPLAY sin duplicados (RT-1 y RT-2). Secuencia global en PostgreSQL y fan-out por Redis. |
| **game** | Railway, dominio público | `https://planazo-game-production.up.railway.app` | Java 21 + Spring Boot. Salas de duelo a 20 Hz (RT-3), validación JWT en REST y STOMP, marcador en Redis (`ZINCRBY`, CC-2) e histórico en PostgreSQL (esquema `minijuego`). |
| **PostgreSQL** | Railway, red privada | privado | Esquemas separados por servicio (`booking`, `promo`, `public` para realtime, `minijuego` para game). |
| **Redis** | Railway, red privada | privado | Bus `planazo.events`, stock de promos, marcador del juego (db 1) y contadores/bloqueos de seguridad por IP. |

## Repositorios de la organización (`planazo-team`)

| Repo | Rol | Cobertura / CI |
|---|---|---|
| `planazo-frontend` | App Next.js 16 (cliente, panel del negocio y `/estado`) | CI + Vitest (**92,4 %** en Sonar) + SonarCloud |
| `planazo-api-gateway` | Gateway HTTP, Auth Google + 2FA, RBAC, Circuit Breaker, Auditoría y Agente | CI + Jest (**89,7 %** en Sonar) + SonarCloud |
| `planazo-booking` | Catálogo, reservas con lock optimista (CC-3), cuentas de negocio y 2FA | CI + Jest (≥ 80 %) + SonarCloud |
| `planazo-promo` | Promociones relámpago con Lua en Redis (CC-1) y bonos de ganadores | CI + Jest (≥ 80 %) + SonarCloud |
| `planazo-realtime` | Gateway WebSocket con secuencia global y `RESUME`/`REPLAY` (RT-1, RT-2) | CI + Jest (≥ 80 %) + SonarCloud |
| `planazo-game` | Minijuego Snake en Java 21 + Spring Boot + STOMP (RT-3, CC-2) | CI + Maven/JaCoCo (≥ 80 %) + SonarCloud |
| `planazo-balancer` | Balanceador HTTP/WS ligero con round-robin y healthcheck activo | Desplegado en Railway (`lb-*`) |
| `planazo-infra` | Docker Compose, contratos, colección Bruno, scripts k6 y stack Prometheus + Grafana | Scripts de verificación e infraestructura |

## Decisiones arquitectónicas (ADRs)

Ver índice completo en [`docs/adr/README.md`](adr/README.md):
- [`ADR-01`](adr/ADR-01-balanceador-carga-explicito.md): Balanceadores de carga explícitos con round-robin y healthcheck activo.
- [`ADR-02`](adr/ADR-02-estado-compartido-servicios-stateless.md): Estado compartido en PostgreSQL y Redis con microservicios stateless.
- [`ADR-03`](adr/ADR-03-escalabilidad-minijuego.md): Escalabilidad del Minijuego mediante autoridad en memoria por sala y marcador atómico en Redis.
- [`ADR-04`](adr/ADR-04-tacticas-tolerancia-fallos.md): Tácticas de tolerancia a fallos (Circuit Breaker, reintentos idempotentes y reconexión con RESUME).
- [`ADR-05`](adr/ADR-05-jwt-stateless.md): Autenticación y autorización stateless mediante JWT compartido.
- [`ADR-06`](adr/ADR-06-auditoria-y-deteccion-ataques.md): Bitácora de auditoría inmutable y detección distribuida de ataques con Redis.
- [`ADR-07`](adr/ADR-07-observabilidad-prometheus-grafana.md): Observabilidad unificada con Prometheus, Grafana, logs JSON y trazabilidad por correlation-id.
