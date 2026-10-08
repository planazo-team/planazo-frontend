# Planazo

Plataforma para descubrir restaurantes, discotecas, hoteles y eventos en un **mapa en tiempo real**, con un **agente inteligente** que arma la ruta del plan y la reserva.

Piloto en **Zona G y Zona T** — Chapinero, Bogotá · MVP de **8 semanas**.

---

## Estado del repositorio

Este repo (`planazo-frontend`) contiene el cliente y el panel del negocio. Cada servicio vive en su propio repositorio dentro de la organización [`planazo-team`](https://github.com/planazo-team), para que cada quien despliegue y trabaje sin bloquear a los demás:

| Repo | Servicio | Dueño | Estado |
|---|---|---|---|
| `planazo-frontend` *(este)* | Next.js — cliente y panel · **docs del proyecto** | Juan Diego | ✅ `mock` y `live` probados; Vercel |
| [`planazo-api-gateway`](https://github.com/planazo-team/planazo-api-gateway) | Entrada HTTP + `agent` como módulo interno | Juan Diego | ✅ En Railway (`planazo-api-gateway-production.up.railway.app`) |
| [`planazo-booking`](https://github.com/planazo-team/planazo-booking) | Cupos, reservas, eventos | Fabián | ✅ En Railway (CC-3); estado en memoria |
| [`planazo-promo`](https://github.com/planazo-team/planazo-promo) | Promociones y cupones | Fabián | ✅ Alineado al contrato (CC-1 en Redis), en Railway |
| [`planazo-game`](https://github.com/planazo-team/planazo-game) | Minijuego Snake | Diego Rozo | ✅ Java + Spring Boot, en Railway e integrado en el frontend |
| [`planazo-realtime`](https://github.com/planazo-team/planazo-realtime) | WebSocket, event log | Juan Camilo | ✅ En Railway; reparte los eventos de promo, booking y game |
| [`planazo-infra`](https://github.com/planazo-team/planazo-infra) | Compose local, k6, contratos, Bruno | Juan Diego | ✅ |
| [`planazo-service-template`](https://github.com/planazo-team/planazo-service-template) | Plantilla NestJS de los servicios | Juan Diego | ✅ |
| [`.github`](https://github.com/planazo-team/.github) | Plantillas de PR e issues de la org | Juan Diego | ✅ |

**Producción:** https://planazo-frontend.vercel.app, en modo `live` contra los cinco servicios en Railway (gateway en `https://planazo-api-gateway-production.up.railway.app`). El modo `mock` sigue existiendo para desarrollar sin backend: simula los servicios en el navegador con los mismos mecanismos de concurrencia y reconexión — ver [`frontend/README.md`](frontend/README.md).

### Documentación del proyecto

Vive en [`docs/`](docs/) de este repo y aplica a toda la organización:

| Documento | Para qué |
|---|---|
| [`estado.md`](docs/estado.md) | **Foto del sistema con fecha:** producción, verificaciones, pendientes por prioridad. |
| [`contexto.md`](docs/contexto.md) | **Empieza aquí.** Producto, equipo, retos, contratos, seed, estado, cómo correr y desplegar. Si contradice a otro, este manda. |
| [`dominios.md`](docs/dominios.md) | Los siete dominios: qué posee cada servicio, sus invariantes, qué publica y qué no hace. |
| [`diagramas.md`](docs/diagramas.md) | Contexto, componentes, despliegue, secuencias de los seis retos, modelo de datos, repos. |
| [`arquitectura.md`](docs/arquitectura.md) | Especificación por servicio: datos, API, eventos y mecanismo de cada reto. |
| [`seguridad.md`](docs/seguridad.md) | Qué se protege, con qué, y qué se deja abierto a propósito. |
| [`plan-organizacion.md`](docs/plan-organizacion.md) | Diagnóstico, reglas de la organización, cronograma de 8 semanas y decisiones pendientes. |

---

## Los seis retos

| | Reto | Mecanismo | Servicio |
|---|---|---|---|
| **RT‑1** | Mapa en tiempo real | Suscripción por zona geográfica | `realtime` + `booking` |
| **RT‑2** | Promociones y eventos en vivo | Event log con secuencia global + idempotencia | `realtime` |
| **RT‑3** | Leaderboard del Snake | Salas + servidor autoritativo a 20 Hz | `game` |
| **CC‑1** | Promociones limitadas | Decremento atómico en Redis | `promo` |
| **CC‑2** | Leaderboard concurrente | Escritura atómica sobre sorted set | `game` |
| **CC‑3** | Cupos limitados | Lock optimista con versionado | `booking` |

---

## Arquitectura

**Cinco microservicios más un gateway de entrada.** Contexto completo del proyecto: [`docs/contexto.md`](docs/contexto.md) · diagrama: [`docs/arquitectura.html`](docs/arquitectura.html) · especificación por servicio: [`docs/arquitectura.md`](docs/arquitectura.md).

### El criterio de corte

No se divide por entidad ("servicio de usuarios", "servicio de eventos"). Se divide por **frontera de consistencia** y **perfil de ejecución**:

- Lo que comparte una **transacción** no se separa — o aparece una transacción distribuida sin necesidad.
- Lo que tiene un **perfil de carga distinto** sí se separa — o se estorban dentro del mismo proceso.

### Los servicios

| # | Servicio | Responsabilidad | Datos | Retos | ¿Recortable? |
|---|---|---|---|---|---|
| 1 | **`booking`** | Franjas, cupos, reservas, eventos del negocio | Memoria (PostgreSQL pendiente) | CC‑3 · RT‑1 | ❌ |
| 2 | **`promo`** | Promociones de stock finito y cupones | Redis (stock) + memoria | CC‑1 | ❌ |
| 3 | **`game`** | Salas, partida de Snake, marcador · Java + Spring Boot | Memoria + PostgreSQL + Redis | RT‑3 · CC‑2 | ❌ |
| 4 | **`realtime`** | WebSocket, suscripciones y event log | PostgreSQL | RT‑2 · RT‑1 | ❌ |
| 5 | **`agent`** | Convierte una frase en una ruta de lugares | Sin estado | — | ✅ |
| — | *`api-gateway`* | Entrada HTTP, validación del token, enrutamiento | Sin estado | — | infraestructura |

**Cuatro son intocables:** cada uno carga al menos un reto obligatorio. **`agent` puede empezar como módulo del gateway** —es sin estado y no implementa ningún reto— y extraerse después si sobra tiempo. Extraer un módulo sin estado es medio día; fusionar dos servicios ya desplegados, no.

### Por qué cada corte

- **`booking` guarda reserva e inventario juntos.** Una reserva escribe en la misma fila que el inventario. Separarlos convierte un `UPDATE … WHERE version = $1` en un problema distribuido.
- **`promo` va aparte de `booking`** aunque ambos manejen recursos escasos. Su mecanismo es otro —contador atómico, no versionado— y su pico de tráfico, mil usuarios reclamando a la vez, **no puede tumbar las reservas**.
- **`game` corre un bucle a 20 Hz.** Compartir proceso con un servidor HTTP mata de hambre a uno de los dos. Además su estado es efímero: si se reinicia, el negocio no se entera.
- **`realtime` es el único con conexiones vivas.** Escala por conexiones concurrentes, no por peticiones. Centralizar ahí el event log hace que la reconexión se implemente **una sola vez** y todos los servicios la hereden.
- **`agent` depende de un tercero** lento, que puede fallar y que cobra por llamada. Aislado, una ráfaga de consultas al modelo no degrada el mapa.

### Qué NO se separa

- ❌ Reservas aparte del inventario — misma transacción
- ❌ Eventos aparte de establecimientos — mismo agregado
- ❌ Leaderboard aparte del juego — CC‑2 es la escritura del propio juego
- ❌ Servicio de notificaciones — `realtime` ya difunde
- ❌ Servicio de usuarios — no hay historias de autenticación en el MVP

### Comunicación

```
cliente ──WebSocket──> realtime ◄─────────────────┐
                                                   │ consume
cliente ──HTTP──> api-gateway ──> booking ──┐      │
                              ├──> promo ───┼──> bus de eventos (Redis pub/sub)
                              ├──> game ────┘
                              └──> agent ──(lectura)──> booking
```

- **Síncrono:** HTTP desde el gateway hacia cada servicio.
- **Asíncrono:** cada servicio publica sus eventos de dominio al bus; `realtime` los persiste con `seq` y los difunde solo a quien está suscrito a esa zona o esa sala.

**Regla inviolable:** ningún servicio escribe en la base de datos de otro, y ningún servicio le dice a otro qué hacer — solo publica lo que le pasó.

---

## Qué se construye de verdad y qué no

El tiempo del MVP se concentra en lo que **no se puede simular**: los dos clicks que compiten por un recurso escaso y el juego en vivo.

### Sin atajos

- **`game`** — el bucle, las colisiones y el marcador concurrente.
- **`promo`** — el click que compite por un cupón de stock 1.
- **`booking`** — el click que compite por el último cupo.
- **`realtime`** — difusión segmentada y recuperación tras desconexión.

> Son **dos clicks sobre recursos de forma distinta**, y por eso se resuelven distinto. El cupón es un contador simple: decremento atómico. El cupo es un recurso compuesto —franja, cantidad variable, hold mientras el usuario confirma— y necesita versionado para detectar que alguien lo modificó mientras decidía.

### Desde datos semilla

| Qué | Cómo |
|---|---|
| Autenticación y roles | 6 usuarios y 3 establecimientos con JWT fijo firmado al arrancar. Sin registro ni recuperación de contraseña |
| Catálogo | Establecimientos, fotos y eventos de Zona G y Zona T cargados por script |
| `agent` | Puede caer a plantillas sobre el catálogo semilla si el cronograma aprieta |

### Fuera del MVP

Pauta, métricas del negocio, notificaciones push fuera de la app, reseñas, billetera de créditos.

---

## Stack

| Capa | Herramienta |
|---|---|
| Frontend | Next.js — web *mobile-first*, cliente y panel en una sola app, desplegada en Vercel |
| Mapa | Leaflet con teselas de OpenStreetMap / CARTO — sin llave de API |
| Servicios | NestJS (Node + TypeScript) en gateway, booking, promo y realtime; `game` en Java 21 + Spring Boot 3 |
| Tiempo real | WebSocket nativo (`ws`) en `realtime`; STOMP sobre WebSocket en `game` |
| Base de datos | PostgreSQL (realtime con Prisma, game con Flyway); booking y promo en memoria por ahora |
| Concurrencia y bus | Redis — stock atómico, sorted set y pub/sub |
| Agente | Claude API con salida estructurada |
| Pruebas de carga | k6 |
| Gestión | Azure DevOps |
| Despliegue de servicios | Railway — un proyecto con los 5 servicios, un Postgres y un Redis; `planazo-infra/scripts/railway-deploy-core.sh` crea gateway, booking y promo |
| Despliegue del frontend | Vercel — importa `planazo-frontend`, Root Directory = `frontend` |

---

## Estructura objetivo

```
planazo-team/                      (organización de GitHub)
├── planazo-frontend/          Next.js — cliente y panel del negocio + docs/ (este repo)
├── planazo-api-gateway/       Entrada HTTP + `agent` como módulo interno
├── planazo-booking/           Cupos, reservas, eventos
├── planazo-promo/             Promociones y cupones
├── planazo-game/              Minijuego Snake
├── planazo-realtime/          WebSocket, event log
├── planazo-infra/             docker compose · k6 · contratos · Bruno
├── planazo-service-template/  plantilla NestJS de los servicios
└── .github/                   plantillas de PR e issues de toda la org
```

Un repo por servicio: cada quien despliega el suyo en Railway sin bloquear a los demás, y el CI/CD de uno no tumba el de otro. `agent` no tiene repo propio — arranca como módulo dentro de `planazo-api-gateway`, tal como describe la sección de arquitectura, y se puede extraer después si sobra tiempo.

La regla es entrar a `main` por PR con el check `ci` verde, con squash merge. GitHub la hace cumplir en `planazo-frontend` (sin aprobación obligatoria desde el 8 de octubre) y en `.github`; en los privados el plan gratuito no permite protección de rama, así que ahí es convención. Cada repo tiene `CODEOWNERS` con su dueño y Dependabot semanal. Detalle en [`docs/plan-organizacion.md`](docs/plan-organizacion.md).

---

## Reparto sugerido

| Persona | Frente | Nota |
|---|---|---|
| 1 | `game` | 10 de las 25 historias del MVP están aquí (SNK-01 a SNK-10) |
| 2 | `realtime` + event log | **Arranca primero:** los demás dependen de él para difundir |
| 3 | `booking` + `promo` | El mismo patrón mental con dos mecanismos distintos |
| 4 | `agent` + seed + integración | El frontend ya existe: conectarlo a modo `live` a medida que cada servicio sale |

`realtime` debería tener el canal funcionando en la **semana 2**, porque `game`, `promo` y `booking` lo necesitan para difundir.

---

## Correr el frontend

```bash
cd frontend
npm install
npm run dev
```

Abre `http://localhost:3000` y entra como cliente o como establecimiento. Por defecto corre en modo `mock`, sin backend ni variables de entorno.

**Modo `live`:** apunta el frontend a los servicios de Railway (las URLs de producción, o las de tu máquina si corres los servicios en local):

```bash
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_API_URL=https://planazo-api-gateway-production.up.railway.app
NEXT_PUBLIC_REALTIME_URL=wss://planazo-realtime-production.up.railway.app/ws
NEXT_PUBLIC_GAME_URL=wss://planazo-game-production.up.railway.app
```

**Desplegar en Vercel:** importa `planazo-frontend` y define **Root Directory = `frontend`**. Vercel detecta Next.js solo; agrega ahí las mismas variables de entorno para modo `live`. Pasos completos y contrato con el backend en [`frontend/README.md`](frontend/README.md).
