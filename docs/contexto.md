# Planazo — documento de contexto

Todo lo que alguien necesita saber para entrar al proyecto sin tener que preguntar. Si algo aquí contradice a otro documento, **este manda**, y hay que corregir el otro.

- **Estado de la aplicación (foto con fecha):** [`estado.md`](estado.md) — qué está en producción, qué se verificó y qué falta.
- **Dominios y fronteras:** [`dominios.md`](dominios.md) — qué posee cada servicio y quién es su dueño.
- **Diagramas:** [`diagramas.md`](diagramas.md) — contexto, componentes, despliegue, secuencias de los seis retos, modelo de datos.
- **Especificación técnica por servicio:** [`arquitectura.md`](arquitectura.md) y el README de cada repo.
- **Seguridad:** [`seguridad.md`](seguridad.md) — qué se protege, con qué, y qué se deja abierto a propósito.
- **Organización y cronograma:** [`plan-organizacion.md`](plan-organizacion.md).
- **Contrato ejecutable:** `frontend/src/lib/types.ts`, `api/types.ts` y `game/types.ts` en este repo; tabla en `planazo-infra/contracts/`.
- **Producción:** https://planazo-frontend.vercel.app (Vercel) contra el gateway en Railway `https://planazo-api-gateway-production.up.railway.app`.

---

## 1 · Qué es Planazo

Plataforma para descubrir restaurantes, discotecas, hoteles y eventos en un **mapa en tiempo real**, con un **agente inteligente** que arma la ruta del plan y la reserva.

- **Piloto:** Zona G y Zona T, Chapinero, Bogotá.
- **MVP:** 8 semanas.
- **Dos usuarios distintos:** el **cliente** (busca plan) y el **establecimiento** (llena sus cupos). La app sirve a los dos desde la misma base de código, con vistas separadas.

El producto no es la novedad del proyecto: lo evaluable son los **seis retos técnicos** de abajo. Todo lo demás existe para que esos seis se puedan demostrar sobre algo real.

---

## 2 · El equipo

| Persona | Frente | Repos |
|---|---|---|
| **Diego Rozo** | Minijuego | `planazo-game` |
| **Fabián Andrade** | Promociones y reservas | `planazo-booking`, `planazo-promo` |
| **Juan Camilo Melo** | Tiempo real y event log | `planazo-realtime` |
| **Juan Diego Melo** | Gateway, agente e integración | `planazo-api-gateway`, `planazo-frontend` |

El reparto no se hizo por tecnología sino por **reto técnico compartido**: quien tiene dos frentes, los tiene porque resuelven el mismo problema de fondo dos veces (Fabián ve el mismo patrón de recurso escaso en cupos y en cupones), y quien tiene uno solo es porque carga la épica más pesada (Diego, con 10 historias del MVP).

**`planazo-realtime` arranca primero.** Tres frentes dependen de él para poder difundir cualquier cosa en vivo.

---

## 3 · Los seis retos

Los seis están dentro del MVP porque son el núcleo evaluable y no admiten media versión.

| | Reto | Mecanismo | Dónde vive |
|---|---|---|---|
| **RT-1** | Mapa en tiempo real | Suscripción por zona geográfica | `realtime` + `booking` |
| **RT-2** | Promociones y eventos en vivo | Event log con secuencia global + idempotencia | `realtime` |
| **RT-3** | Leaderboard del Snake | Salas + servidor autoritativo a 20 Hz | `game` |
| **CC-1** | Promociones limitadas | Decremento atómico en Redis | `promo` |
| **CC-2** | Leaderboard concurrente | Escritura atómica sobre sorted set | `game` |
| **CC-3** | Cupos limitados | Lock optimista con versionado | `booking` |

**CC-1 y CC-3 parecen el mismo problema y no lo son.** Son dos clicks compitiendo por un recurso escaso, pero el cupón es un **contador simple** (restar sin que dos resten lo mismo → `DECR` atómico) y el cupo es un **recurso compuesto** —franja, cantidad variable, editable por el negocio mientras el cliente decide— que necesita versionado para detectar la edición concurrente. Usar el mecanismo del otro en cualquiera de los dos no resuelve el reto.

---

## 4 · Mapa de repos

Organización: [`planazo-team`](https://github.com/planazo-team). Un repo por servicio, cada uno con su despliegue independiente.

| Repo | Qué es | Puerto local |
|---|---|---|
| [`planazo-frontend`](https://github.com/planazo-team/planazo-frontend) | Next.js — cliente y panel del negocio | `3000` |
| [`planazo-api-gateway`](https://github.com/planazo-team/planazo-api-gateway) | Entrada HTTP + módulo `agent` | `8080` |
| [`planazo-booking`](https://github.com/planazo-team/planazo-booking) | Cupos, reservas, eventos | `3001` |
| [`planazo-promo`](https://github.com/planazo-team/planazo-promo) | Promociones y cupones | `3002` |
| [`planazo-game`](https://github.com/planazo-team/planazo-game) | Snake multijugador · Java 21 + Spring Boot | `8082` (REST `/api/v1` y STOMP `/ws` en el mismo puerto) |
| [`planazo-realtime`](https://github.com/planazo-team/planazo-realtime) | WebSocket y event log | WS `8081` |

Y tres repos de apoyo, sin lógica de negocio:

| Repo | Qué es |
|---|---|
| [`planazo-infra`](https://github.com/planazo-team/planazo-infra) | `docker compose` para levantar todo en local, pruebas k6 de los retos, contratos (`http.md`, `events.schema.json`), colección Bruno |
| [`planazo-service-template`](https://github.com/planazo-team/planazo-service-template) | Plantilla NestJS con `/health`, guard de `x-gateway-key`, identidad por headers, publicador del bus, Dockerfile y CI. `booking`, `promo` y `realtime` nacen de aquí; `game` es la excepción (Java) |
| [`.github`](https://github.com/planazo-team/.github) | Plantillas de PR e issues y portada de la organización, aplicadas a todos los repos |

**`agent` no tiene repo propio.** Es un módulo dentro del gateway: no tiene estado, no implementa ningún reto, y es la única pieza recortable del proyecto. Extraerlo después es medio día de trabajo; fusionar dos servicios ya desplegados, no.

---

## 5 · Arquitectura

### El criterio de corte

Los servicios no se dividen por entidad ("servicio de usuarios", "servicio de eventos"). Se dividen por **frontera de consistencia** y **perfil de ejecución**:

- Lo que comparte una **transacción** no se separa — o aparece una transacción distribuida sin necesidad.
- Lo que tiene un **perfil de carga distinto** sí se separa — o se estorban dentro del mismo proceso.

Por eso:

- **`booking` guarda reserva e inventario juntos.** Una reserva escribe en la misma fila que el inventario; separarlos convierte un `UPDATE … WHERE version = $1` en un problema distribuido.
- **`promo` va aparte de `booking`** aunque ambos repartan recursos escasos: su mecanismo es otro, y su pico de tráfico —mil usuarios reclamando a la vez— **no puede tumbar las reservas**.
- **`game` corre un bucle a 20 Hz.** Compartir proceso con un servidor HTTP mata de hambre a uno de los dos.
- **`realtime` es el único con conexiones vivas.** Escala por conexiones concurrentes, no por peticiones.
- **`agent` depende de un tercero** lento, que puede fallar y que cobra por llamada. Aislado, una ráfaga de consultas al modelo no degrada el mapa.

### Qué NO se separa

- Reservas aparte del inventario — misma transacción.
- Eventos aparte de establecimientos — mismo agregado.
- Leaderboard aparte del juego — CC-2 **es** la escritura del propio juego.
- Servicio de notificaciones — `realtime` ya difunde.
- **Servicio de usuarios** — no hay historias de autenticación en el MVP (ver §7).

### El dibujo

```
                 ┌─────────────┐
                 │  frontend   │  Next.js en Vercel
                 └──┬───────┬──┘
            HTTP    │       │    WebSocket directo
                    ▼       └──────────────┐
            ┌───────────────┐              │
            │  api-gateway  │              │
            │  + agent      │              │
            └───┬───┬───┬───┘              │
                │   │   │                  │
        ┌───────┘   │   └───────┐          │
        ▼           ▼           ▼          │
   ┌─────────┐ ┌─────────┐ ┌─────────┐     │
   │ booking │ │  promo  │ │  game   │     │
   └────┬────┘ └────┬────┘ └────┬────┘     │
        │           │           │          │
        └───────────┴───────────┘          │
                    │ publican             │
                    ▼                      │
            ┌───────────────┐              │
            │ bus de eventos│              │
            └───────┬───────┘              │
                    │ consume              │
                    ▼                      │
            ┌───────────────┐              │
            │   realtime    │◄─────────────┘
            └───────────────┘
```

- **Síncrono:** HTTP desde el gateway hacia cada servicio.
- **Asíncrono:** cada servicio publica sus eventos de dominio al bus; `realtime` los persiste con su `seq` y los difunde solo a quien está suscrito a esa zona o esa sala.
- **`game` también manda por el bus** el estado de cada tick (`GAME.STATE_UPDATE`) y la lista de salas (`LOBBY.ROOMS_UPDATE`), y `realtime` los reparte. El navegador solo le habla directo por STOMP para los comandos: registrar la sesión y mover.

**Regla inviolable:** ningún servicio escribe en la base de datos de otro, y ningún servicio le dice a otro qué hacer — solo publica lo que le pasó.

### Los dominios

Cada servicio implementa **un dominio** con fronteras explícitas: qué términos usa, qué agregados guarda, qué invariantes nunca rompe, qué expone y qué publica. La ficha de cada uno está en [`dominios.md`](dominios.md). Resumen:

| Dominio | Servicio | Posee | Invariante que lo define |
|---|---|---|---|
| Identidad y acceso | `api-gateway` | usuarios semilla, token | un negocio administra exactamente un establecimiento |
| Catálogo y disponibilidad | `booking` | establecimientos, franjas, reservas, eventos del negocio | `taken ≤ capacity`, siempre |
| Promociones | `promo` | promociones, stock, cupones | cupones emitidos `≤ initialStock` |
| Juego | `game` | salas, partidas, marcador | solo el servidor mueve; el marcador solo sube |
| Difusión y memoria | `realtime` | event log, suscripciones | `seq` estrictamente creciente; `RESUME` sin pérdida ni duplicados |
| Planificación | módulo `agent` | nada (sin estado) | solo lugares del catálogo; nunca reserva |
| Experiencia | `frontend` | el contrato ejecutable | ante `409` relee y explica |

Los datos que varios necesitan leer (nombre y zona de los 12 lugares, nombre del usuario) se resuelven por **copia de lectura desde el mismo seed** o por header (`x-user-name`), no por llamadas entre servicios. Detalle en `dominios.md` §3.

---

## 6 · Contratos entre piezas

Esto es lo que rompe la integración si alguien lo cambia por su cuenta.

### 6.1 Rutas

El gateway recibe todo bajo `/api` y **quita ese prefijo** al reenviar:

| El frontend pide | El gateway reenvía | A |
|---|---|---|
| `/api/places*` | `/places*` | booking |
| `/api/reservations*` | `/reservations*` | booking |
| `/api/events*` | `/events*` | booking |
| `/api/promos*` | `/promos*` | promo |
| `/api/salas*` · `/api/leaderboard*` · `/api/historico*` | `/api/v1/salas*` · `/api/v1/leaderboard*` · `/api/v1/historico*` | game, **con el `Authorization: Bearer` reenviado**: valida el JWT por su cuenta |
| `/api/plan` | — | el módulo `agent`, dentro del gateway |
| `/api/auth/demo` | — | el propio gateway |
| `/api/health` | — | el propio gateway (sin token) |

**Cada servicio expone sus rutas SIN `/api`** y además `GET /health` sin auth.

**Todo lo que viaja por HTTP y WebSocket va en `camelCase`** (`slotId`, `durationS`, `placeId`), tal como lo envía el frontend. Cuerpos exactos:

| Llamada | Request | Response |
|---|---|---|
| `POST /api/reservations` | `{ slotId, people, version }` | `Reservation` · `409 VERSION_CONFLICT` / `SIN_CUPO` |
| `PATCH /api/places/:id/slots/:sid` | `{ capacity, version }` | `Slot` · `409 VERSION_CONFLICT` / `CAPACIDAD_MENOR` |
| `POST /api/events` | `{ placeId, title, startsAt, capacity }` | `PlaceEvent` |
| `POST /api/promos` | `{ placeId, title, discount, stock, durationS }` | `Promo` |
| `POST /api/promos/:id/claim` | — | `Coupon` · `409 PROMO_AGOTADA` / `PROMO_VENCIDA` |
| `POST /api/plan` | `{ text }` | `PlanResult { intro, stops: [{ placeId, placeName, category, hour, why }] }` |
| `POST /api/salas/:id/jugadores` | — | `201 { data: ResumenSala }` · `409 SALA_LLENA` · `404` — game envuelve en `{ data }` y sus errores son `{ codigo, mensaje }` |
| `DELETE /api/salas/:id/jugadores/:jugadorId` | — | `204` (solo el propio jugador) |
| `GET /api/leaderboard?limite=10` | — | `{ data: EntradaLeaderboard[] }` |

Las formas de `Reservation`, `Slot`, `Promo`, `Coupon`, etc. están en `frontend/src/lib/types.ts`; las del juego (`ResumenSala`, `EstadoJuego`, `EntradaLeaderboard`) en `frontend/src/lib/game/types.ts`. La tabla completa, en `planazo-infra/contracts/http.md`.

### 6.2 Identidad

El gateway valida el JWT una sola vez y pasa la identidad en headers. **Ningún servicio HTTP vuelve a validar el token:**

| Header | Contenido |
|---|---|
| `x-user-id` | `u1`…`u6` (cliente), `b1`,`b2`,`b3` (negocio) |
| `x-user-name` | nombre para mostrar, URL-encoded (`Juan%20Diego`). Lo usan `booking` (reserva) y `game` (jugador) |
| `x-user-role` | `cliente` \| `negocio` |
| `x-user-place-id` | solo negocio: el establecimiento que administra |
| `x-gateway-key` | secreto compartido `GATEWAY_KEY`. El servicio rechaza con `401 GATEWAY_KEY_INVALIDA` lo que no lo traiga |

El gateway **sobrescribe** estos headers con lo que dice el token; lo que mande el cliente con esos nombres se descarta. La llave existe para que nadie pueda saltarse el gateway e inventarse una identidad, aunque conozca la URL de un servicio. Ver [`seguridad.md`](seguridad.md).

**Excepción:** `game` y `realtime` verifican el JWT ellos mismos, con el **mismo secreto** del gateway. `realtime` porque su WebSocket no pasa por el gateway: el token va en el primer mensaje `AUTH`, nunca por query string. `game` en todo lo suyo: el gateway le reenvía el `Authorization: Bearer` en HTTP, y el navegador lo manda en el header `Authorization` del frame `CONNECT` de STOMP. Lee los claims `sub` (id) y `nombre`; por eso el gateway firma el token con `nombre` además de `name`. En game la variable se llama `JWT_SECRETO` y debe ser idéntica a `JWT_SECRET`. `game` no usa `x-gateway-key`.

### 6.3 Errores

El gateway reenvía el status tal cual. Los códigos que el frontend entiende:

| Código | Significado | Lo devuelve |
|---|---|---|
| `409` | El recurso se agotó o alguien lo cambió mientras decidías | booking (CC-3), promo (CC-1), game (sala llena) |
| `401` | Falta token o está vencido; o falta `x-gateway-key` | gateway; cualquier servicio |
| `403` | El rol no puede hacer eso (`ROL_NO_AUTORIZADO`) | cualquier servicio |
| `429` | Demasiadas peticiones por minuto (`RATE_LIMIT`) | gateway |
| `502` | El servicio destino no respondió (`SERVICIO_NO_DISPONIBLE`) | gateway |

Cuerpo esperado en los errores: `{ code, message }` con un `message` que el usuario pueda leer. **El `409` es criterio de aceptación de las historias, no un fallo a ocultar.**

### 6.4 Eventos

| Evento | Lo emite | Lo recibe |
|---|---|---|
| `PLACE.UPDATE` | booking | clientes de esa zona |
| `INV.UPDATE` | booking | clientes con esa ficha abierta y el panel |
| `RESERVE.OK` · `RESERVE.CONFLICT` | booking | el usuario y el panel del negocio |
| `PROMO.PUSH` · `PROMO.EXPIRED` | promo | clientes de esa zona |
| `PROMO.WON` · `PROMO.REJECTED` | promo | el usuario y el panel del negocio |
| `LOBBY.ROOMS_UPDATE` | game | tópico `salas`: quien mira la lista de salas |
| `GAME.STATE_UPDATE` | game | tópico `salas:<salaId>`: los jugadores de esa sala, en cada tick (20 Hz) |
| `GAME.PARTIDA_FINALIZADA` | game | tópico `global`: resultado de la partida |

Todos pasan por el bus y llegan al cliente a través de `realtime`. El productor publica al canal Redis `planazo.events` este **sobre**:

```json
{ "id": "uuid-v4", "type": "PROMO.PUSH", "topics": ["zone:zona-t"], "payload": { "id": "pr-1", "placeId": "p7", "placeName": "Bar El Zaguán", "zone": "zona-t", "title": "2x1 en cócteles", "discount": "2x1", "stock": 10, "initialStock": 10, "expiresAt": 1727280120000 }, "at": 1727280000000 }
```

`seq` **no lo pone el productor**: lo asigna `realtime` al persistir y el cliente lo recibe como `RtEvent { seq, id, type, payload, topics, at }`. Tópicos válidos: `zone:<zona>`, `place:<id>`, `user:<id>`, `salas`, `salas:<salaId>`, `global` (`room:<código>` era del diseño anterior del juego y ya no se usa). **El payload va plano**: `PROMO.PUSH` lleva la `Promo` tal cual, `RESERVE.OK` la `Reservation` tal cual; así los consume el frontend. Payload de cada tipo en `arquitectura.md` y en `planazo-infra/contracts/events.schema.json`.

---

## 7 · Autenticación: lo que hay y lo que no

**No hay registro, ni login con contraseña, ni recuperación.** Ninguna historia de autenticación entró al MVP, así que no existe un servicio de identidad.

Lo que hay: **9 usuarios semilla con JWT fijo**, firmado por el propio gateway en `POST /api/auth/demo` con `{ userId }`.

| id | Nombre | Rol | Administra |
|---|---|---|---|
| `u1` | Juan Diego | cliente | — |
| `u2` | Valentina | cliente | — |
| `u3` | Camilo | cliente | — |
| `u4` | Sara | cliente | — |
| `u5` | Andrés | cliente | — |
| `u6` | Laura | cliente | — |
| `b1` | Bar El Zaguán | negocio | `p7` |
| `b2` | Fideos de la Nona | negocio | `p1` |
| `b3` | Terraza 85 | negocio | `p8` |

Esta lista está duplicada a propósito en dos sitios y **tienen que coincidir**:
`planazo-frontend/frontend/src/lib/session.ts` y `planazo-api-gateway/src/auth/seed-users.ts`.

---

## 8 · Datos semilla

El catálogo del piloto son **12 establecimientos** (`p1`…`p12`) repartidos entre Zona G y Zona T, con sus franjas horarias y eventos. Viven hoy en `planazo-frontend/frontend/src/lib/seed.ts`.

Cuando `booking` exista, debe servir **este mismo catálogo** desde su propio seed, para que el modo `mock` y el modo `live` muestren lo mismo y las demos sean comparables.

Categorías: `restaurante`, `bar`, `discoteca`, `hotel`, `evento`, `aire-libre`.
Zonas: `zona-g` (centro `4.6553, -74.0566`), `zona-t` (centro `4.6672, -74.0536`).

---

## 9 · Estado actual

| Pieza | Estado |
|---|---|
| `frontend` | **En producción en Vercel, en modo `live` contra los cinco servicios.** Probado de punta a punta: login, mapa, ficha, reserva con 409, promos, cupones, panel del negocio, eventos en vivo y una partida de cuatro jugadores en el minijuego. |
| `api-gateway` | **En Railway** (`planazo-api-gateway-production.up.railway.app`). Auth demo, proxy con `x-gateway-key` y `x-user-name` a booking y promo, proxy con `Bearer` a game (`/api/salas`, `/api/leaderboard`, `/api/historico`), CORS con lista blanca, rate limit, `/api/health`, módulo `agent` con fallback a plantilla (sin `ANTHROPIC_API_KEY` configurada todavía). |
| `booking` | **En Railway, solo por red privada.** Lugares, franjas, reservas con lock optimista (CC-3), panel del negocio y seed del catálogo. Estado **en memoria**: un redespliegue reinicia las reservas. PostgreSQL pendiente. |
| `promo` | **Reescrito sobre la plantilla NestJS y en Railway, por red privada** (PR #14, 8 oct). Stock en Redis con decremento atómico en Lua (CC-1), publica al bus, rutas en camelCase, guard del gateway. Promociones y cupones **en memoria**; PostgreSQL pendiente (issue #3, punto 2). |
| `game` | **Implementado por Diego y desplegado en Railway.** Java + Spring Boot con arquitectura hexagonal: dominio `Sala`/`Serpiente`, runtime de partida, leaderboard en Redis, migración Flyway, Swagger y tests de ArchUnit. Comandos por STOMP; el snapshot de cada tick y la lista de salas salen al bus (`GAME.STATE_UPDATE`, `LOBBY.ROOMS_UPDATE`) y llegan al frontend por realtime. El frontend usa su cliente (`test-client.html`) con el mismo diseño. |
| `realtime` | **Implementado por Camilo y desplegado en Railway.** Protocolo WebSocket completo (AUTH, SUBSCRIBE, RESUME, REPLAY) con Prisma y PostgreSQL para el event log. Probado en producción: un `PROMO.PUSH` de promo llega al cliente suscrito a `zone:zona-t`. |
| `planazo-infra` | **Existe.** Compose local, k6 de CC-1, CC-3 y RT-2 vigentes (el de CC-2 sigue el protocolo viejo del juego y hay que reescribirlo a STOMP), contratos, colección Bruno y `scripts/railway-deploy-core.sh`, que crea gateway, booking y promo en Railway. |
| Producción | **Probada de punta a punta el 8 de octubre:** login, mapa, ficha, reserva con `409`, promo reclamada, `PROMO.PUSH` llegando por realtime y una partida de cuatro jugadores en `Sala Cartagena`. Pendiente correr los k6 contra Railway. |

### Decisiones de stack ya tomadas

Las divergencias detectadas el 25 de septiembre se resolvieron así:

| Tema | Decisión (8 de octubre) |
|---|---|
| `game` en Java 21 + Spring Boot | **Se queda en Java.** Es el código de Diego y funciona. Railway lo construye con su propio `Dockerfile` (Maven). El frontend integra su cliente (`test-client.html`) tal cual, con el mismo diseño. |
| `promo` en React + Vite + Express | **Reescrito en NestJS** sobre la plantilla (PR #14): sin UI, stock en Redis, bus, camelCase. |
| Bus: Redis pub/sub vs RabbitMQ | **Redis pub/sub, canal `planazo.events`, para todos.** Camilo quitó RabbitMQ de `game` y lo pasó a Redis. |
| `game` detrás del gateway | El gateway reenvía `/api/salas`, `/api/leaderboard` y `/api/historico` a `/api/v1/...` de game **con el `Bearer`**, y firma el token con el claim `nombre` que game lee. Los usuarios son los nueve semilla del gateway; los `j-ana`… de game solo sirven para su `dev-token`. |
| Estado del juego en vivo | Camilo cambió el broadcaster de `game`: el estado de cada tick y la lista de salas van **al bus** (`GAME.STATE_UPDATE`, `LOBBY.ROOMS_UPDATE`) y `realtime` los reparte. STOMP queda para los comandos. Consecuencia: `realtime` persiste 20 eventos por segundo por sala en partida; el equipo debe decidir si eso se persiste o solo se difunde. |

**Swagger:** solo `game` lo expone (`/swagger-ui.html`). Falta en gateway, booking, promo y realtime.

**Pendientes de producto:** PostgreSQL en booking y promo (hoy en memoria), k6 de CC-2 con el protocolo STOMP, k6 de CC-1, CC-3 y RT-2 corridos contra Railway, y en `game` restringir CORS y apagar `POST /api/v1/auth/dev-token`.

### El modo `mock` es el andamio

El frontend puede correr sin backend: simula los servicios en el navegador **con los mismos mecanismos** de concurrencia y reconexión, incluido el protocolo del minijuego. Sirve para dos cosas:

1. Demostrar el flujo completo aunque falten servicios.
2. Ser la referencia de comportamiento: cuando `booking` esté listo, su `409` debe verse igual que el del mock.

Se cambia a `live` con variables de entorno, **sin tocar código**.

---

## 10 · Correr todo en local

Todo vive como repos hermanos en una misma carpeta. `planazo-infra` los orquesta:

```bash
# 0 · una sola vez: clonar todo y preparar secretos locales
gh repo clone planazo-team/planazo-infra && cd planazo-infra
./scripts/clone-all.sh                # clona los demás repos al lado
cp .env.example .env                  # JWT_SECRET y GATEWAY_KEY locales

# 1 · infraestructura (Redis + 3 Postgres) en contenedores
./scripts/up.sh

# 2 · tu servicio, en caliente, en su puerto
cd ../planazo-booking && cp .env.example .env && npm install && npm run start:dev    # :3001
#    game es Java: cd ../planazo-game && cp .env.example .env && docker compose up -d && mvn spring-boot:run   # :8082

# 3 · todo lo demás en contenedores (o también en caliente, cada quien el suyo)
cd ../planazo-infra && ./scripts/up-all.sh
./scripts/status.sh                   # /health de cada uno + login de prueba

# 4 · frontend contra el gateway real
#    planazo-frontend/frontend/.env.local
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_REALTIME_URL=ws://localhost:8081/ws
NEXT_PUBLIC_GAME_URL=ws://localhost:8082
cd ../planazo-frontend/frontend && npm install && npm run dev    # :3000
```

El frontend solo, sin nada más, siempre funciona en modo `mock`. Con gateway y frontend arriba, el login funciona y las rutas de un servicio que no esté corriendo responden `502` controlado, así se ve qué falta. Sin `NEXT_PUBLIC_REALTIME_URL` la app funciona solo por HTTP; sin `NEXT_PUBLIC_GAME_URL` no hay partida.

`GATEWAY_KEY` y `JWT_SECRET` deben ser **los mismos** en el `.env` de infra y en el de cada servicio que corras en caliente; si no, el gateway recibirá `401 GATEWAY_KEY_INVALIDA` de tu servicio.

---

## 11 · Despliegue

| Pieza | Dónde | Variable que debe publicar |
|---|---|---|
| `frontend` | Vercel (Root Directory = `frontend`) | — |
| `api-gateway` | Railway, dominio público | `https://planazo-api-gateway-production.up.railway.app` → `NEXT_PUBLIC_API_URL` |
| `booking` | Railway (estado en memoria por ahora) | red privada → `BOOKING_URL` del gateway |
| `promo` | Railway + Redis (stock) | red privada → `PROMO_URL` del gateway |
| `game` | Railway + Postgres (esquema `minijuego`) + Redis (db 1), dominio público | `GAME_URL=http://planazo-game.railway.internal:8082` en el gateway · `NEXT_PUBLIC_GAME_URL=wss://planazo-game-production.up.railway.app` |
| `realtime` | Railway + Postgres (esquema `public`, Prisma) + Redis, dominio público | `NEXT_PUBLIC_REALTIME_URL=wss://planazo-realtime-production.up.railway.app/ws` |

`planazo-infra/scripts/railway-deploy-core.sh` crea gateway, booking y promo con estas variables en un solo paso. `realtime` y `game` se despliegan desde GitHub (`railway service source connect`) y reciben a mano `JWT_SECRET` / `GATEWAY_KEY` y `JWT_SECRETO` con los mismos valores.

Reglas del despliegue (diagrama en `diagramas.md` §3):

- **Un solo proyecto de Railway** con los 5 servicios, un Postgres y un Redis. Hoy `JWT_SECRET`, `GATEWAY_KEY` y `BUS_URL` están como **variables de cada servicio** (las pone el script), no como variables compartidas; el valor es el mismo en todos y se generó con `openssl rand -hex 32`. Nunca viajan por chat.
- **Un solo Postgres** compartido por `realtime` (esquema `public`) y `game` (esquema `minijuego`); `booking` y `promo` no usan base de datos todavía. **Un solo Redis** para el bus, el stock de `promo` y el leaderboard de `game`.
- `booking` y `promo` **sin dominio público**: el gateway los alcanza por la red privada (`http://booking.railway.internal:3001`). `game` y `realtime` sí tienen dominio público por el WebSocket.
- `game` y `realtime` corren en **una sola instancia**: tienen estado en memoria (salas, suscripciones) y varias instancias lo repartirían mal.
- `ALLOWED_ORIGINS` del gateway = la URL de Vercel. `NODE_ENV=production` para que el gateway exija secretos reales.
- Cada push a `main` despliega: Vercel y Railway están conectados a GitHub. En `planazo-frontend`, `main` exige PR con el check `ci` en verde; la aprobación obligatoria se quitó el 8 de octubre para no frenar la integración. Los repos privados no admiten protección de rama en el plan gratuito.

---

## 12 · Qué se construye de verdad y qué no

El tiempo del MVP se concentra en lo que **no se puede simular**: los dos clicks que compiten por un recurso escaso y el juego en vivo.

**Sin atajos:** `game` (bucle, colisiones, marcador concurrente) · `promo` (el click por un cupón de stock 1) · `booking` (el click por el último cupo) · `realtime` (difusión segmentada y recuperación tras desconexión).

**Desde datos semilla:** autenticación y roles (JWT fijo), catálogo (script de seed), y el `agent` puede caer a plantillas sobre el catálogo si el cronograma aprieta.

**Fuera del MVP:** pauta, métricas del negocio, notificaciones push fuera de la app, reseñas, billetera de créditos, pasarela de pago, lista de espera.

---

## 13 · Definition of Done del proyecto

Dos criterios aplican a estos servicios y **no son opcionales**:

1. **Recurso finito** (`booking`, `promo`, `game`): no se da por terminada una historia sin una prueba de carga con peticiones concurrentes y **cero sobreventas**.
2. **Tiempo real** (`realtime` y todo lo que difunde): no se da por terminada sin probarla **desconectando y reconectando**, sin pérdida ni duplicados de eventos.

> Una historia puede funcionar perfecto para un solo usuario y romperse con diez a la vez. Ese es exactamente el punto del proyecto.
