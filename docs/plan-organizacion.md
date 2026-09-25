# Plan para estructurar `planazo-team`

Fecha del diagnóstico: **25 de septiembre de 2026** (semana 1 del MVP de 8 semanas).
Objetivo: que la organización, los seis repos y el flujo de trabajo queden ordenados de forma que **todo corra junto en local y en la nube**, y que cada persona pueda avanzar en su servicio sin bloquear ni romper a los demás.

Este documento complementa a [`contexto.md`](contexto.md) (qué es Planazo y sus contratos) y a [`arquitectura.md`](arquitectura.md) (especificación por servicio). Aquí solo está **cómo se organiza el trabajo**.

---

## Estado de ejecución (25 de septiembre de 2026)

Lo que ya quedó aplicado el mismo día del diagnóstico:

| Frente | Hecho | Pendiente |
|---|---|---|
| **Documentos** | [`dominios.md`](dominios.md), [`diagramas.md`](diagramas.md), [`seguridad.md`](seguridad.md); `arquitectura.md` y `contexto.md` corregidos al contrato real (camelCase, sobre del evento, payloads planos, `x-gateway-key`, `x-user-name`) | Mantenerlos con cada PR `contrato` |
| **Organización** | Permiso base `write`; cada dueño `admin` en su repo; Diego Rozo `admin` en `planazo-game`; Dependabot alerts + security fixes en todos los repos; secret scanning y push protection por defecto para repos nuevos; 14 etiquetas comunes en los 9 repos | Que Diego Rozo acepte la invitación a la org; 2FA obligatorio y bloquear que miembros borren repos o cambien visibilidad (solo desde la web, Settings de la org) |
| **Repos nuevos** | `.github` (plantillas de PR e issues, portada), `planazo-service-template` (NestJS, health, guard de la llave, identidad, bus, Dockerfile, CI, 17 tests), `planazo-infra` (compose con Redis y 3 Postgres verificado, 4 k6, contratos, Bruno) | — |
| **Gateway** | CORS con lista blanca, `x-gateway-key` y `x-user-name` hacia los servicios, `/api/health`, timeout a upstreams, arranque rechazado en producción sin secretos, contrato `PlanResult` del agente, Dockerfile, CI, CODEOWNERS, Dependabot | Desplegar en Railway |
| **Frontend** | CI (typecheck + build), Dockerfile para el compose, CODEOWNERS, Dependabot | Desplegar en Vercel; completar `promos` de la ficha desde `/api/promos` en modo `live` |
| **booking · game · realtime** | Esqueleto desde la plantilla con su puerto, dueño y CI | Toda la lógica de dominio, por sus dueños |
| **promo** | CI, CODEOWNERS, Dependabot, `.env` ignorado; issue con las 7 correcciones | Las correcciones (§6), por Fabián |
| **Protección de `main`** | Squash merge y borrar rama al merge en los 9 repos. Protección (PR + 1 aprobación + check `ci` + sin force push, admins incluidos) aplicada en `planazo-frontend` y `.github` | **Los 7 repos privados no admiten protección de rama en el plan gratuito de GitHub** (responde `403: Upgrade to GitHub Pro or make this repository public`). Hay que decidir §9.1: hacerlos públicos y correr `bash /tmp/protect.sh <repo>` (script en §8), o quedarse sin protección |
| **Decisiones del equipo** (§9) | — | **Visibilidad (bloquea la protección de rama)**, herramienta de historias, Express en promo. Se tomaron por defecto: repos nuevos privados salvo `.github`; 1 aprobación obligatoria |

---

## 0 · Diagnóstico: qué hay hoy

Revisado directamente contra GitHub con la cuenta de Juan Diego.

### Organización

| Aspecto | Estado | Problema |
|---|---|---|
| Miembros | 3 activos (`juandiegomelo21-commits`, `Camilo22prog`, `DiegoFabianAndrade`) + 1 invitación pendiente (`diegoale8504-hub`) | Diego Rozo aún no ha aceptado. Solo tiene acceso `write` a `planazo-frontend`, **no a `planazo-game`**, que es su repo. |
| Permiso por defecto | `admin` para todos los miembros en todos los repos | Cualquiera puede borrar repos, cambiar visibilidad o forzar push a `main`. |
| Equipos (teams) | ninguno | No hace falta con 4 personas, pero sí un rol claro por repo (ver §2). |
| 2FA obligatorio | no | Recomendable activarlo. |
| Visibilidad | `planazo-frontend` público, los otros 5 privados | Inconsistente. Decidir (ver §9). |
| Proyectos de GitHub | no se pudo consultar (el token no tiene `read:project`) | El README dice que la gestión va en Azure DevOps. Hay que elegir una sola herramienta. |

### Repos

| Repo | Código | CI | Protección de `main` | Issues / PRs | Dockerfile |
|---|---|---|---|---|---|
| `planazo-frontend` | ✅ Next.js 15, funciona en `mock` | ❌ | ❌ | 0 / 0 | — (Vercel) |
| `planazo-api-gateway` | ✅ NestJS 10, probado en local | ❌ | ❌ | 0 / 0 | ❌ |
| `planazo-promo` | ⚠️ Express + Vite/React, 5 commits de Fabián | ❌ | ❌ | 0 / 0 | ❌ |
| `planazo-booking` | solo README | ❌ | ❌ | 0 / 0 | ❌ |
| `planazo-game` | solo README | ❌ | ❌ | 0 / 0 | ❌ |
| `planazo-realtime` | solo README | ❌ | ❌ | 0 / 0 | ❌ |

Ningún repo tiene `.github/`, ni workflow, ni plantilla de PR, ni protección de rama. Los 10 labels son los que GitHub crea por defecto. Todo el trabajo hasta ahora ha sido push directo a `main`.

### Desvíos de `planazo-promo` respecto al contrato

Fabián ya avanzó bastante, y eso es bueno, pero el repo se apartó de lo acordado en varios puntos. Conviene corregirlo **ahora**, que es barato, y no en la semana 5.

1. **Tiene una interfaz React completa adentro** (`src/App.tsx`, `CustomerView`, `EstablishmentPanel`, `NotificationCenter`, `localStorage`). Duplica pantallas que ya existen en `planazo-frontend` y llama al servicio directo en `http://localhost:3002`, saltándose el gateway. Un microservicio no lleva UI.
2. **CC-1 no usa Redis.** El stock vive en un `Map` en memoria con un mutex de promesas (`locks`). En un solo proceso funciona, pero no es el mecanismo acordado (`DECR` atómico en Lua), no sobrevive a un reinicio y no se puede demostrar bajo carga real con k6 contra Railway.
3. **Lleva su propio event log con `seq`.** Eso es responsabilidad de `realtime`. `promo` solo debe **publicar** al bus.
4. **Rutas fuera de contrato:** `GET /promos/notifications`, `GET /promos/events`, `GET /promos/place/:id`, `PUT /promos/:id`. Las notificaciones son de `realtime`. Falta `/promos/mine` y `/promos/:id/claim` alineados con lo que llama el frontend.
5. **Nombres distintos a los del frontend:** `discountPercentage`, `initialStock`, `expiresAt`, zona `'Zona G'`. El frontend envía `{ placeId, title, discount, stock, durationS }` y espera zonas `zona-g` / `zona-t`.
6. Stack distinto al acordado (Express en lugar de NestJS). No es grave, pero sí lo es no tener `Dockerfile`, `test`, `typecheck` ni `.env.example`.

### Un desvío en la propia documentación

`arquitectura.md` y `contexto.md` describen cuerpos en `snake_case` (`slot_id`, `duration_s`) mientras el frontend, que es lo que realmente corre, envía `camelCase` (`slotId`, `durationS`). Si cada servicio implementa lo que dice el doc, **ningún `POST` del frontend va a funcionar**. Ver §5.

---

## 1 · Principios de organización

1. **Un repo por servicio, uno por despliegue.** Ya está así; no se cambia.
2. **`main` siempre desplegable.** Todo entra por PR, con CI verde. Railway y Vercel despliegan desde `main` automáticamente.
3. **El contrato vive en un solo sitio y se cambia por PR.** El frontend es el consumidor de todos; lo que está en `frontend/src/lib/types.ts` y `live.ts` es la verdad ejecutable.
4. **Cada servicio se puede correr solo y todos se pueden correr juntos** con un solo comando (§3).
5. **La definición de terminado se prueba, no se afirma.** Cada servicio con recurso finito trae su script k6; `realtime` trae su prueba de reconexión.

---

## 2 · Organización de GitHub: cambios concretos

### Miembros y permisos

| Acción | Quién puede hacerlo |
|---|---|
| Reenviar la invitación a Diego Rozo (`diegoale8504-hub`) y confirmar que la acepta | Owner de la org (Juan Diego) |
| Cambiar **Member privileges → Base permissions** de `Admin` a `Write` | Owner de la org, desde la web |
| Dar `admin` explícito a cada dueño en su repo y `write` en los demás | Cualquier admin del repo (se puede hacer con `gh`) |
| Activar **Require two-factor authentication** | Owner de la org |

Reparto de permisos resultante:

| Repo | Admin | Write |
|---|---|---|
| `planazo-frontend` | Juan Diego | todos |
| `planazo-api-gateway` | Juan Diego | todos |
| `planazo-booking` | Fabián | todos |
| `planazo-promo` | Fabián | todos |
| `planazo-game` | Diego Rozo | todos |
| `planazo-realtime` | Juan Camilo | todos |
| `planazo-infra` (nuevo, §3) | Juan Diego | todos |

Juan Diego queda como owner de la organización, así siempre hay alguien que puede arreglar cualquier repo.

### Protección de `main` (los 7 repos, idéntica)

- Requiere PR; nada de push directo.
- **1 aprobación** de otra persona. Con 4 personas es viable y evita que un desvío como el de `promo` pase inadvertido dos semanas.
- Requiere que el check `ci` pase.
- Los admins **no** se saltan la regla (`enforce_admins`). Si hay urgencia, se desactiva un momento y se vuelve a activar.
- Borrar la rama al hacer merge. Solo **squash merge**, para que `main` tenga un commit por PR con el título del PR.

Esto se aplica con `gh api` sobre cada repo; hay un script en §8.

### Labels comunes (los 7 repos)

Se borran los 10 por defecto y se crean:

| Grupo | Labels |
|---|---|
| Reto | `RT-1` `RT-2` `RT-3` `CC-1` `CC-2` `CC-3` |
| Tipo | `feature` `bug` `infra` `docs` `contrato` |
| Estado | `bloqueado` `necesita-decision` |

`contrato` marca cualquier PR que toque rutas, cuerpos, headers o eventos; **obliga a avisar en el canal** y a actualizar `contexto.md`.

### Repo `.github` de la organización

Un repo llamado exactamente `.github` en `planazo-team` hace que GitHub use sus archivos como valor por defecto para **todos** los repos que no tengan los suyos:

```
.github/
├── profile/README.md            portada de la organización (qué es Planazo, links a cada repo)
├── PULL_REQUEST_TEMPLATE.md     qué reto toca, cómo se probó, ¿cambia el contrato?
├── ISSUE_TEMPLATE/
│   ├── historia.yml             historia de usuario: HU, reto, criterio de aceptación
│   └── bug.yml
└── CODEOWNERS                   (no aplica a nivel org; va en cada repo)
```

---

## 3 · Repo nuevo: `planazo-infra`

Hoy no hay forma de levantar todo junto ni de correr una prueba de carga de punta a punta. Ese es el hueco más grande para "que todo funcione". Un repo pequeño lo resuelve:

```
planazo-infra/
├── README.md                    cómo levantar todo con un comando
├── docker-compose.yml           postgres-booking, postgres-promo, postgres-realtime, redis,
│                                y los 5 servicios construidos desde ../planazo-<svc>
├── .env.example                 JWT_SECRET compartido, URLs internas
├── scripts/
│   ├── clone-all.sh             clona los 6 repos como hermanos de este
│   ├── up.sh / down.sh          docker compose con perfiles (solo infra, o todo)
│   └── seed.sh                  carga el catálogo p1..p12 en booking
├── k6/
│   ├── cc1-promo-claim.js       N usuarios reclaman stock M: exactamente M éxitos
│   ├── cc3-booking-reserve.js   N reservas sobre capacidad N-5: exactamente 5 × 409
│   ├── cc2-game-score.js        escrituras concurrentes al leaderboard
│   └── rt2-reconnect.js         corta y reconecta: sin pérdida ni duplicados por id
├── contracts/
│   ├── events.schema.json       payload de cada evento de §6.4 de contexto.md
│   └── http.md                  tabla única de rutas y cuerpos (camelCase), generada desde el frontend
└── postman/ o bruno/            colección para probar cada servicio a mano
```

Reglas del compose:

- Cada servicio se construye desde su propio `Dockerfile` (por eso cada repo necesita uno, §4).
- `docker compose --profile infra up` levanta solo Postgres y Redis, para que cada quien corra **su** servicio con `npm run start:dev` y el resto en contenedor.
- `docker compose up` levanta todo. El frontend apunta a `http://localhost:8080`, `ws://localhost:8081/ws`, `ws://localhost:8082`.
- Los puertos son los de `contexto.md` §4: `3000`, `8080`, `3001`, `3002`, `3003`/`8082`, `8081`.

**Dueño:** Juan Diego, porque el frente de integración es suyo. Las pruebas k6 de cada reto las escribe el dueño del servicio dentro de este repo, así hay un solo lugar para correr la evaluación completa.

---

## 4 · Estándar mínimo por repo de servicio

Checklist que **todo** repo de servicio (`booking`, `promo`, `game`, `realtime`, `api-gateway`) debe cumplir antes de considerarse "existente":

| Pieza | Detalle |
|---|---|
| Stack | NestJS 10 + TypeScript, Node 20 (`engines` en `package.json`, `.nvmrc`). `promo` puede quedarse en Express si Fabián lo prefiere, pero con la misma estructura de scripts. |
| Scripts | `start:dev`, `build`, `start`, `typecheck`, `lint`, `test`. CI corre los cuatro últimos. |
| `GET /health` | `{ service, status, version }`. Railway lo usa como health check y el compose también. |
| `Dockerfile` | multi-stage: `npm ci` → `npm run build` → imagen `node:20-alpine` con `dist/`. |
| `.env.example` | todas las variables con comentario. Nunca `.env` en git. |
| Bus | módulo `bus` que publica `{ id: uuid, type, payload, topics, at }` a Redis pub/sub. La forma del sobre es la misma para todos (§5). |
| Identidad | lee `x-user-id`, `x-user-role`, `x-user-place-id`; **no** valida JWT (excepto los WebSockets de `game` y `realtime`). |
| Errores | siempre `{ code, message }` con los códigos que el frontend conoce: `VERSION_CONFLICT`, `SIN_CUPO`, `PROMO_AGOTADA`, `PROMO_VENCIDA`, `CAPACIDAD_MENOR`, `SALA_NO_EXISTE`, `SALA_EN_JUEGO`, `JUGADORES_INSUFICIENTES`. |
| Seed | script `npm run seed` que carga los datos de `frontend/src/lib/seed.ts` (booking) o los usuarios (gateway). |
| `.github/workflows/ci.yml` | `npm ci` · `typecheck` · `lint` · `test` · `build` · `docker build`. Un solo job llamado `ci`, que es el que exige la protección de rama. |
| `.github/CODEOWNERS` | `* @<dueño>` para que GitHub pida su revisión automáticamente. |
| README | ya existe en los 5 y está bien. Se le agrega la sección "Correr con Docker". |

**Plantilla.** Para no repetir esto cuatro veces a mano, Juan Diego arma `planazo-service-template` (repo marcado como *template* en GitHub) con NestJS + health + bus + Dockerfile + CI + k6 vacío. `booking`, `game` y `realtime` arrancan aplicándolo sobre su repo actual; `promo` toma de ahí Dockerfile, CI y el módulo `bus`.

---

## 5 · Congelar el contrato

### El problema

Tres fuentes hoy dicen cosas distintas:

| Fuente | Reservar | Lanzar promo |
|---|---|---|
| `arquitectura.md` | `{ slot_id, people, version }` | `{ discount, stock, duration_s }` |
| `frontend/src/lib/api/types.ts` (lo que corre) | `{ slotId, people, version }` | `{ placeId, title, discount, stock, durationS }` |
| `planazo-promo/src/routes/promos.ts` | — | `{ establishmentId, zone, title, discountPercentage, initialStock, expiresAt }` |

### La decisión

- **`camelCase` en todo lo que viaja por HTTP y por WebSocket**, porque es lo que el frontend ya envía y recibe, y porque cambiar el frontend es un solo repo pero cambiar la doc es gratis.
- Se corrigen `arquitectura.md` y `contexto.md` §6 para que muestren los cuerpos exactos en `camelCase` (tarea de Juan Diego, esta semana).
- `planazo-infra/contracts/http.md` se genera a partir de `types.ts` y es la tabla de referencia para todos.
- **Sobre del evento** (lo que cada servicio publica al bus y `realtime` persiste):

```json
{ "id": "uuid", "type": "PROMO.PUSH", "topics": ["zone:zona-g"], "payload": { }, "at": "2026-09-25T18:00:00Z" }
```

`seq` **no** lo pone quien publica: lo asigna `realtime` al persistir. Esto resuelve el desvío 3 de `promo`.

- Los identificadores de zona son `zona-g` y `zona-t`, y las categorías las de `contexto.md` §8. Sin espacios ni mayúsculas.

### Cómo se cambia

Un cambio de contrato es un PR a `planazo-frontend` que toca `types.ts` + `docs/contexto.md`, con label `contrato`, y un mensaje en el canal. Nadie implementa un campo que no esté ahí.

---

## 6 · Correcciones a `planazo-promo`

En orden, cada una como un PR pequeño de Fabián con revisión de Juan Diego:

1. **Sacar la UI.** Borrar `index.html`, `vite.config.ts`, `src/App.tsx`, `src/main.tsx`, `src/components/`, `src/index.css`, `src/services/store.ts` y las dependencias de React/Vite. Si alguna pantalla del panel del negocio que hizo Fabián aporta algo que el frontend no tiene (por ejemplo, la edición de eventos), se propone como PR a `planazo-frontend`.
2. **Stock en Redis** con el script Lua de `arquitectura.md` §2, y cupones en PostgreSQL después de que Redis confirme. `ioredis` + `pg` o TypeORM, a su gusto.
3. **Publicar al bus** en lugar de guardar el event log local. Quitar `/promos/events` y `/promos/notifications`.
4. **Alinear rutas y cuerpos** con §5: `POST /promos` recibe `{ placeId, title, discount, stock, durationS }` y toma `placeId` de `x-user-place-id` si no viene; responde el `Promo` del frontend (`id, placeId, placeName, zone, title, discount, stock, initialStock, expiresAt` en epoch ms). Agregar `GET /promos/mine`. Zonas en `zona-g`/`zona-t`.
5. **Estándar de repo** (§4): Dockerfile, CI, `.env.example`, `typecheck`, `test`.
6. **k6 de CC-1** en `planazo-infra/k6/cc1-promo-claim.js`: 200 usuarios virtuales contra stock 10, resultado exactamente 10 × `200` y 190 × `409`.

---

## 7 · Cronograma de 8 semanas

La semana 1 empezó el lunes 21 de septiembre de 2026.

| Semana | Fechas | Organización e infra (Juan Diego) | `realtime` (Juan Camilo) | `booking` + `promo` (Fabián) | `game` (Diego Rozo) |
|---|---|---|---|---|---|
| **1** | 21–27 sep | Este plan. Protección de ramas, labels, permisos, repo `.github`. Corregir contrato en docs. Plantilla de servicio. | Leer contrato. Esqueleto Nest desde la plantilla. | Correcciones 1–4 de `promo` (§6). | Aceptar invitación. Esqueleto desde la plantilla. Salas por HTTP. |
| **2** | 28 sep–4 oct | `planazo-infra` con compose e infra levantando. Gateway y frontend desplegados (Railway + Vercel) en modo `live` respondiendo `502` controlado. | **Canal funcionando:** AUTH, SUBSCRIBE, EVENT desde el bus, persistencia con `seq`. Desplegado en Railway. | `booking`: esquema, seed p1..p12, `GET /places`. `promo`: Dockerfile, CI, publica al bus. | Bucle 20 Hz, WebSocket con AUTH en primer mensaje, `INTENT` → `STATE`. |
| **3** | 5–11 oct | Integrar `realtime` y `promo` al frontend `live`. Colección Postman/Bruno. | RESUME y REPLAY (RT-2). Prueba de reconexión en `planazo-infra/k6`. | `booking`: `POST /reservations` con CC-3, `PATCH` de franjas, eventos al bus. | Colisiones, comida, `ROUND.END`. Leaderboard en Redis (CC-2). |
| **4** | 12–18 oct | Integrar `booking` y `game`. Todo el flujo cliente en `live`. **Hito: demo interna con los 6 retos en la nube.** | Tópicos `place:` y `user:`. Métricas básicas (conexiones, eventos/s). | k6 de CC-1 y CC-3 con cero sobreventas. `GET /reservations/mine`, `/places/:id/reservations`. | `hall-of-fame`, desempate determinista. k6 de CC-2. |
| **5** | 19–25 oct | Panel del negocio en `live`. Agente con Claude API y caché. | Prueba de carga de conexiones. Cierre limpio y reconexión masiva. | Panel: `POST /events`, conflictos de staff (409 en PATCH). | Salas simultáneas, límite de jugadores, expulsión por inactividad. |
| **6** | 26 oct–1 nov | Correr los 4 k6 desde `planazo-infra` contra Railway. Corregir lo que se rompa. | Ajustes tras k6 de los otros servicios. | Ajustes tras k6. | Ajustes tras k6. |
| **7** | 2–8 nov | Congelar contrato. Documentación final. Ensayo de la demo. | Doc y ensayo. | Doc y ensayo. | Doc y ensayo. |
| **8** | 9–15 nov | Solo bugs. Entrega. | | | |

Dependencia crítica: **`realtime` desplegado en la semana 2.** Si se atrasa, `promo`, `booking` y `game` pueden seguir publicando al bus en local con el compose, pero la demo en la nube se corre una semana.

---

## 8 · Despliegue y variables

| Pieza | Dónde | Variables que necesita | Variable que publica |
|---|---|---|---|
| `frontend` | Vercel, Root Directory `frontend`, desde `main` | `NEXT_PUBLIC_API_MODE=live`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_REALTIME_URL`, `NEXT_PUBLIC_GAME_URL` | — |
| `api-gateway` | Railway | `JWT_SECRET`, `BOOKING_URL`, `PROMO_URL`, `GAME_URL`, `ANTHROPIC_API_KEY` | `NEXT_PUBLIC_API_URL` |
| `booking` | Railway + Postgres | `DATABASE_URL`, `BUS_URL` | `BOOKING_URL` |
| `promo` | Railway + Postgres + Redis | `DATABASE_URL`, `REDIS_URL`, `BUS_URL` | `PROMO_URL` |
| `game` | Railway + Redis | `JWT_SECRET`, `REDIS_URL`, `BUS_URL` | `GAME_URL`, `NEXT_PUBLIC_GAME_URL` |
| `realtime` | Railway + Postgres | `JWT_SECRET`, `DATABASE_URL`, `BUS_URL` | `NEXT_PUBLIC_REALTIME_URL` |

- **Un solo proyecto de Railway** con los 5 servicios y una **variable compartida** `JWT_SECRET` y `BUS_URL` (Railway permite *shared variables*), para que gateway, game y realtime firmen y verifiquen con el mismo secreto sin pasárselo por chat.
- **Un solo Redis** para bus y para los contadores/leaderboard es suficiente en el MVP. Si `promo` tumba el Redis con su pico, se separa después.
- `game` y `realtime` con **1 réplica**: tienen estado en memoria.
- Los PRs a `planazo-frontend` obtienen vista previa en Vercel; los servicios no necesitan preview.

### Aplicar la protección de rama a los 7 repos

Requiere un token con `repo` (el actual sirve). Para cada repo:

```bash
for r in planazo-frontend planazo-api-gateway planazo-booking planazo-promo planazo-game planazo-realtime planazo-infra; do
  gh api -X PUT "repos/planazo-team/$r/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["ci"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 1, "dismiss_stale_reviews": true },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
  gh api -X PATCH "repos/planazo-team/$r" -f delete_branch_on_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F allow_squash_merge=true
done
```

Ojo: exigir el check `ci` **antes** de que el workflow exista bloquea todos los merges. Orden correcto: primero el PR con `ci.yml` en cada repo, luego la protección.

---

## 9 · Decisiones que tiene que tomar el equipo

| # | Decisión | Recomendación |
|---|---|---|
| 1 | ¿Repos públicos o privados? | **Todos públicos.** Es un proyecto académico, facilita que los evaluadores lo vean y Vercel/Railway gratuitos no ponen trabas. **Además es la única forma de tener protección de `main` y secret scanning sin pagar GitHub Pro:** en el plan gratuito, los repos privados no admiten reglas de rama. El historial de los 7 repos ya se escaneó y no contiene secretos ni `.env`. Si hay razón para privado, entonces todos privados, incluido el frontend, y se acepta trabajar sin protección de rama. |
| 2 | ¿Azure DevOps o GitHub Projects para las historias? | **GitHub Projects** (un tablero a nivel org con las 25 historias, cada una un issue en su repo). Tener el tablero al lado del código evita mantener dos sitios. Si la materia exige Azure DevOps, entonces Azure para historias y GitHub solo para código, sin duplicar. |
| 3 | ¿`promo` se reescribe en NestJS o se queda en Express? | **Se queda en Express** si Fabián aplica las correcciones de §6 esta semana. El stack no es el reto; el mecanismo sí. |
| 4 | ¿1 aprobación obligatoria en PRs? | **Sí.** Cuesta 10 minutos por PR y es lo único que habría detectado los desvíos de `promo` a tiempo. |
| 5 | ¿Docs en `planazo-frontend/docs` o repo `planazo-docs`? | **Se quedan donde están** hasta la semana 7. Moverlos ahora es churn sin beneficio. El repo `.github` de la org apunta a ellos desde la portada. |

---

## 10 · Qué se puede ejecutar ya con la cuenta actual

Con el token de `gh` que hay hoy (`repo`, `read:org`):

- ✅ Crear `planazo-infra`, `planazo-service-template` y `.github`.
- ✅ Agregar CI, PR template, CODEOWNERS a cada repo por PR.
- ✅ Labels, protección de rama, squash-only, borrar rama al merge.
- ✅ Dar acceso a Diego Rozo a `planazo-game` cuando acepte.
- ❌ Cambiar el permiso base de la organización, exigir 2FA, reenviar la invitación: hay que hacerlo desde la web de GitHub (Settings de la org) o darle a `gh` el scope `admin:org` con `gh auth refresh -s admin:org,read:project`.

Orden sugerido para esta semana:

1. Arreglar el contrato en `arquitectura.md` y `contexto.md` (camelCase, sobre del evento).
2. Crear `.github` de la org con PR template e issue templates.
3. Crear `planazo-service-template`.
4. Abrir un PR con `ci.yml` + `Dockerfile` + `CODEOWNERS` en `api-gateway` (sirve de ejemplo para los demás).
5. Aplicar labels y protección de rama a los repos que ya tengan `ci.yml`.
6. Crear `planazo-infra` con el compose.
7. Reunión de 30 minutos con el equipo para las 5 decisiones de §9 y para explicarle a Fabián las correcciones de §6.
