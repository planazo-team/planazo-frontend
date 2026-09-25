# Planazo — documento de contexto

Todo lo que alguien necesita saber para entrar al proyecto sin tener que preguntar. Si algo aquí contradice a otro documento, **este manda**, y hay que corregir el otro.

- **Dominios y fronteras:** [`dominios.md`](dominios.md) — qué posee cada servicio y quién es su dueño.
- **Diagramas:** [`diagramas.md`](diagramas.md) — contexto, componentes, despliegue, secuencias de los seis retos, modelo de datos.
- **Especificación técnica por servicio:** [`arquitectura.md`](arquitectura.md) y el README de cada repo.
- **Seguridad:** [`seguridad.md`](seguridad.md) — qué se protege, con qué, y qué se deja abierto a propósito.
- **Organización y cronograma:** [`plan-organizacion.md`](plan-organizacion.md).
- **Contrato ejecutable:** `frontend/src/lib/types.ts` y `api/types.ts` en este repo; tabla en `planazo-infra/contracts/`.

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
| [`planazo-game`](https://github.com/planazo-team/planazo-game) | Snake multijugador | `3003` / WS `8082` |
| [`planazo-realtime`](https://github.com/planazo-team/planazo-realtime) | WebSocket y event log | WS `8081` |

Y tres repos de apoyo, sin lógica de negocio:

| Repo | Qué es |
|---|---|
| [`planazo-infra`](https://github.com/planazo-team/planazo-infra) | `docker compose` para levantar todo en local, pruebas k6 de los retos, contratos (`http.md`, `events.schema.json`), colección Bruno |
| [`planazo-service-template`](https://github.com/planazo-team/planazo-service-template) | Plantilla NestJS con `/health`, guard de `x-gateway-key`, identidad por headers, publicador del bus, Dockerfile y CI. Los servicios nuevos arrancan de aquí |
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
| `/api/rooms*` | `/rooms*` | game |
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
| `POST /api/rooms` · `/join` · `/start` | — | `Room` · `404 SALA_NO_EXISTE` · `409 SALA_EN_JUEGO` / `JUGADORES_INSUFICIENTES` |

Las formas de `Reservation`, `Slot`, `Promo`, `Coupon`, `Room`, etc. están en `frontend/src/lib/types.ts`. La tabla completa, en `planazo-infra/contracts/http.md`.

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

**Excepción:** `game` y `realtime` sí verifican el JWT ellos mismos, porque sus WebSockets no pasan por el gateway. Usan el **mismo `JWT_SECRET`**, y reciben el token **en el primer mensaje del socket**, nunca por query string.

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
| `ROOM.JOIN` · `SNAKE.SCORE` · `ROUND.END` | game | la sala |

Todos pasan por el bus y llegan al cliente a través de `realtime`. El productor publica al canal Redis `planazo.events` este **sobre**:

```json
{ "id": "uuid-v4", "type": "PROMO.PUSH", "topics": ["zone:zona-t"], "payload": { "id": "pr-1", "placeId": "p7", "placeName": "Bar El Zaguán", "zone": "zona-t", "title": "2x1 en cócteles", "discount": "2x1", "stock": 10, "initialStock": 10, "expiresAt": 1727280120000 }, "at": 1727280000000 }
```

`seq` **no lo pone el productor**: lo asigna `realtime` al persistir y el cliente lo recibe como `RtEvent { seq, id, type, payload, topics, at }`. Tópicos válidos: `zone:<zona>`, `place:<id>`, `user:<id>`, `room:<código>`. **El payload va plano**: `PROMO.PUSH` lleva la `Promo` tal cual, `RESERVE.OK` la `Reservation` tal cual; así los consume el frontend. Payload de cada tipo en `arquitectura.md` y en `planazo-infra/contracts/events.schema.json`.

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
| `frontend` | **Existe y funciona.** Modo `mock` completo: simula los 5 servicios en el navegador, con concurrencia y reconexión simuladas. CI y Dockerfile listos. Falta desplegar en Vercel. |
| `api-gateway` | **Existe y está probado en local y en Docker.** Auth demo, proxy con `x-gateway-key` y `x-user-name`, CORS con lista blanca, rate limit, `/api/health`, módulo `agent` con el contrato `PlanResult` y fallback a plantilla. CI y Dockerfile listos. Falta desplegar en Railway. |
| `promo` | **Tiene código de Fabián** (Express) que hay que alinear al contrato: sacar la UI, stock en Redis, publicar al bus, nombres en camelCase. La lista está en el issue del repo. CI agregado. |
| `booking`, `game`, `realtime` | **Esqueleto desde la plantilla:** `/health`, guard de la llave, identidad, bus, Dockerfile y CI. Sin lógica de dominio todavía. |
| `planazo-infra` | **Existe.** Compose con Redis y tres Postgres, k6 de los cuatro retos de concurrencia/reconexión, contratos, colección Bruno. |
| Conexión frontend ↔ gateway | **Probada de punta a punta** en local: login real, token emitido, rutas protegidas respondiendo, CORS bloqueando orígenes ajenos. |

### El modo `mock` es el andamio

El frontend corre hoy sin backend: simula los servicios en el navegador **con los mismos mecanismos** de concurrencia y reconexión. Sirve para dos cosas:

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

El frontend solo, sin nada más, siempre funciona en modo `mock`. Con gateway y frontend arriba, el login funciona y las rutas de datos responden `502` controlado — que es lo correcto mientras los servicios no existan, y así se ve qué falta.

`GATEWAY_KEY` y `JWT_SECRET` deben ser **los mismos** en el `.env` de infra y en el de cada servicio que corras en caliente; si no, el gateway recibirá `401 GATEWAY_KEY_INVALIDA` de tu servicio.

---

## 11 · Despliegue

| Pieza | Dónde | Variable que debe publicar |
|---|---|---|
| `frontend` | Vercel (Root Directory = `frontend`) | — |
| `api-gateway` | Railway | su URL → `NEXT_PUBLIC_API_URL` del frontend |
| `booking` | Railway + PostgreSQL | su URL → `BOOKING_URL` del gateway |
| `promo` | Railway + PostgreSQL + Redis | su URL → `PROMO_URL` del gateway |
| `game` | Railway + Redis | HTTP → `GAME_URL` del gateway · WS → `NEXT_PUBLIC_GAME_URL` |
| `realtime` | Railway + PostgreSQL + Redis | WS → `NEXT_PUBLIC_REALTIME_URL` del frontend |

Reglas del despliegue (diagrama en `diagramas.md` §3):

- **Un solo proyecto de Railway** con los 5 servicios. `JWT_SECRET`, `GATEWAY_KEY` y `BUS_URL` como **variables compartidas** del proyecto: se generan con `openssl rand -hex 32` y no se pasan por chat.
- `booking` y `promo` **sin dominio público**: el gateway los alcanza por la red privada (`http://booking.railway.internal:3001`). `game` y `realtime` sí tienen dominio público por el WebSocket.
- `game` y `realtime` corren en **una sola instancia**: tienen estado en memoria (salas, suscripciones) y varias instancias lo repartirían mal.
- `ALLOWED_ORIGINS` del gateway = la URL de Vercel. `NODE_ENV=production` para que el gateway exija secretos reales.
- Cada push a `main` despliega. Por eso `main` está protegida: PR, 1 aprobación y CI verde.

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
