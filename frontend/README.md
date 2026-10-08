# Planazo · Frontend

App del **cliente** y **panel del establecimiento** en una sola aplicación Next.js, *mobile-first*, lista para desplegar en Vercel.

```bash
npm install
npm run dev        # http://localhost:3000
```

Sin configurar nada arranca en **modo mock**: los servicios corren simulados en el navegador, así que funciona completa sin backend.

---

## Los dos modos

| Modo | Qué hace | Cuándo |
|---|---|---|
| `mock` | booking, promo, game, agent y el Realtime Gateway corren simulados en el navegador | Para desarrollar sin backend. Es el valor por defecto en local |
| `live` | HTTP contra el API Gateway, WebSocket contra realtime y STOMP contra game | **Producción** (https://planazo-frontend.vercel.app), contra los cinco servicios en Railway |

Se cambia con una sola variable. Copia `.env.example` a `.env.local`:

```bash
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_API_URL=https://<gateway>.up.railway.app
# opcionales: sin ellas la app funciona solo por HTTP (sin eventos en vivo ni partida)
NEXT_PUBLIC_REALTIME_URL=wss://<realtime>.up.railway.app/ws
NEXT_PUBLIC_GAME_URL=wss://<game>.up.railway.app
```

Las pantallas no saben en qué modo están: todas hablan con la misma interfaz, [`src/lib/api/types.ts`](src/lib/api/types.ts).

### El modo mock no es una maqueta

Aplica **los mismos mecanismos** que los servicios reales, y hay otros usuarios simulados escribiendo sobre los mismos recursos mientras tu solicitud viaja. Por eso los conflictos que ves son conflictos de verdad:

- **Reservas** — compare-and-set sobre la `version` de la franja. Si otro usuario escribe durante la latencia, tu reserva recibe `409`.
- **Cupones** — verificar y descontar en un solo paso indivisible. Nunca se entregan más que el stock.
- **Juego** — un servidor autoritativo a 20 Hz con otros jugadores; tú solo envías la dirección.
- **Reconexión** — el botón **Cortar señal** corta la conexión 6 s. Al volver se reanuda desde el último `seq` y se descartan duplicados.

Los datos viven en memoria de la pestaña y se reinician al recargar.

---

## Dónde vive cada reto

| Reto | En el frontend | Archivo |
|---|---|---|
| **RT‑1** Mapa en tiempo real | Los pines y la ficha se actualizan con `PLACE.UPDATE` e `INV.UPDATE` | [`cliente/mapa`](src/app/cliente/mapa/page.tsx) · [`cliente/lugar/[id]`](src/app/cliente/lugar/[id]/page.tsx) |
| **RT‑2** Consistencia ante desconexión | Guarda el último `seq`, pide `RESUME` al reconectar y descarta por `id` | [`lib/realtime/client.ts`](src/lib/realtime/client.ts) |
| **RT‑3** Leaderboard en vivo | Dibuja el snapshot de cada tick que manda el servidor; envía solo direcciones | [`cliente/juego`](src/app/cliente/juego/page.tsx) · [`components/TableroSnake.tsx`](src/components/TableroSnake.tsx) · [`lib/game/client.ts`](src/lib/game/client.ts) |
| **CC‑1** Promociones limitadas | Muestra el stock en vivo y explica el rechazo si se agotó | [`components/PromoCard.tsx`](src/components/PromoCard.tsx) |
| **CC‑2** Leaderboard concurrente | Muestra el marcador global tal como lo ordena el servidor (`GET /api/leaderboard`) | [`cliente/juego`](src/app/cliente/juego/page.tsx) · [`lib/mock/game.ts`](src/lib/mock/game.ts) |
| **CC‑3** Cupos limitados | Envía la `version` leída; ante `409` recarga y explica | [`cliente/lugar/[id]`](src/app/cliente/lugar/[id]/page.tsx) · [`negocio`](src/app/negocio/page.tsx) |

> En el panel del negocio, la **versión base se toma cuando el usuario empieza a editar**, no cuando guarda. Si se tomara al guardar, un cambio de otro dispositivo nunca se detectaría.

---

## Pantallas

| Ruta | Rol | Qué hace |
|---|---|---|
| `/` | — | Elige un usuario semilla (autenticación hardcodeada) |
| `/cliente/mapa` | cliente | Mapa de Zona G y Zona T con cupos en vivo y filtros por categoría |
| `/cliente/lugar/:id` | cliente | Ficha, promociones, eventos y reserva por franja |
| `/cliente/agente` | cliente | Describe tu plan y recibe lugares sugeridos |
| `/cliente/juego` | cliente | Salas en vivo, tablero, jugadores y marcador global: el cliente de planazo-game con su mismo diseño |
| `/cliente/planes` | cliente | Mis reservas y mis cupones |
| `/negocio` | negocio | Cupos por franja, eventos, lanzar promoción y reservas entrantes |

---

## Estructura

```
src/
├── app/                  rutas (App Router)
│   ├── cliente/          mapa · lugar · agente · juego · planes
│   └── negocio/          panel del establecimiento
├── components/           piezas de interfaz compartidas
└── lib/
    ├── api/              interfaz de servicios + implementación live y mock
    ├── realtime/         cliente de tiempo real y transporte WebSocket
    ├── game/             cliente del minijuego: REST por el gateway, STOMP para comandos, estado por realtime
    ├── mock/             servicios simulados: gateway, booking/promo/agent, game
    ├── seed.ts           catálogo semilla de Zona G y Zona T
    ├── session.ts        usuarios semilla
    └── types.ts          tipos del contrato con los servicios
```

---

## Contrato con el backend (modo live)

Sigue [`docs/arquitectura.md`](../docs/arquitectura.md). Todo pasa por el API Gateway con `Authorization: Bearer <token>`.

**HTTP**

| Método | Ruta | Servicio |
|---|---|---|
| `POST` | `/api/auth/demo` `{userId}` → `{token}` | gateway |
| `GET` | `/api/places?zone=&category=` | booking |
| `GET` | `/api/places/:id` | booking · `promos` se completa con `GET /api/promos?zone=` (promo) filtrando por `placeId` |
| `GET` | `/api/places/:id/reservations` | booking |
| `PATCH` | `/api/places/:id/slots/:sid` `{capacity, version}` | booking |
| `POST` | `/api/reservations` `{slotId, people, version}` | booking |
| `GET` | `/api/reservations/mine` | booking |
| `POST` | `/api/events` | booking |
| `GET` | `/api/promos?zone=` | promo |
| `POST` | `/api/promos` | promo |
| `POST` | `/api/promos/:id/claim` | promo |
| `GET` | `/api/promos/mine` | promo |
| `POST` | `/api/plan` `{text}` | agent |
| `GET` | `/api/salas` · `POST /api/salas/:id/jugadores` · `DELETE /api/salas/:id/jugadores/:jugadorId` | game (Java) · responde `{ data }` |
| `GET` | `/api/leaderboard?limite=10` · `/api/historico/mio` | game (Java) |

Los errores esperados responden con `{ code, message }`: `VERSION_CONFLICT`, `SIN_CUPO`, `PROMO_AGOTADA`, `PROMO_VENCIDA`, `CAPACIDAD_MENOR`, `SALA_NO_EXISTE`, `SALA_EN_JUEGO`, `JUGADORES_INSUFICIENTES`. Game responde sus errores como `{ codigo, mensaje }` (p. ej. `SALA_LLENA`).

**Realtime Gateway** — `NEXT_PUBLIC_REALTIME_URL`

```
→ { type: "AUTH", token }                         primer mensaje, nunca en la URL
→ { type: "SUBSCRIBE",   topic: "zone:zona-g" }
→ { type: "UNSUBSCRIBE", topic }
→ { type: "RESUME", last_seq, topics: [...] }     al reconectar
← { type: "EVENT",  event }
← { type: "REPLAY", events: [...] }
```

Tópicos: `zone:<zona>`, `place:<id>`, `user:<id>`, `salas`, `salas:<salaId>`, `global`.

**Partida** — comandos por STOMP sobre `NEXT_PUBLIC_GAME_URL/ws/websocket` (planazo-game, Java), con el JWT en el header `Authorization` del frame CONNECT; **estado por realtime**, porque game lo publica al bus:

```
STOMP
  SUBSCRIBE /user/queue/errores               errores propios { codigo, mensaje }
  SEND      /app/salas/{id}/registrar-sesion  tras unirse: asocia el socket al jugador (y reconecta, SNK-07)
  SEND      /app/salas/{id}/mover             { direccion: "ARRIBA" | "ABAJO" | "IZQUIERDA" | "DERECHA" }
realtime
  SUBSCRIBE salas            → EVENT LOBBY.ROOMS_UPDATE  payload ResumenSala[]
  SUBSCRIBE salas:{id}       → EVENT GAME.STATE_UPDATE   payload EstadoJuegoDTO, en cada tick
```

La pantalla del juego (`src/app/cliente/juego`) es el cliente de prueba de planazo-game (`test-client.html`) llevado a la app con su mismo diseño; el tablero se dibuja en `src/components/TableroSnake.tsx`. En modo `mock` el simulador del navegador habla este mismo protocolo (`src/lib/mock/game.ts`).

---

## Desplegar en Vercel

1. En Vercel: **Add New → Project** e importa el repositorio.
2. **Root Directory:** `frontend`. Vercel detecta Next.js solo; no hay que tocar el build.
3. Variables de entorno: ninguna para el modo mock. Para live, `NEXT_PUBLIC_API_MODE=live`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_REALTIME_URL` y `NEXT_PUBLIC_GAME_URL` (las cuatro ya están en producción).
4. **Deploy.**

Cada push a `main` despliega a producción, y cada pull request obtiene su propia URL de vista previa.
