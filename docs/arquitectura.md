# Arquitectura de Planazo — especificación de servicios

Diagramas: [`diagramas.md`](diagramas.md) · Dominios: [`dominios.md`](dominios.md) · Seguridad: [`seguridad.md`](seguridad.md) · Visión general: [`../README.md`](../README.md)

Cinco microservicios más un gateway de entrada, cortados por **frontera de consistencia** y **perfil de ejecución**. Este documento es el insumo para programar cada servicio: datos que posee, su API, los eventos que emite y el mecanismo que resuelve su reto.

> **Convención de nombres.** Todo lo que viaja por HTTP o WebSocket va en **`camelCase`** (`slotId`, `durationS`, `placeId`), porque es lo que el frontend ya envía y recibe (`frontend/src/lib/types.ts`). Las columnas de base de datos van en `snake_case` y cada servicio traduce al responder. La tabla completa de rutas y cuerpos está en `planazo-infra/contracts/http.md`.

---

## Reglas comunes a todos los servicios

| Regla | Detalle |
|---|---|
| **Sin prefijo `/api`** | El gateway recibe `/api/places` y reenvía `/places`. |
| **Identidad por headers** | `x-user-id`, `x-user-name` (URL-encoded), `x-user-role` (`cliente` \| `negocio`), `x-user-place-id` (solo negocio). Los pone el gateway a partir del JWT. **No validar el JWT** en HTTP. |
| **Llave del gateway** | Header `x-gateway-key`. Si el servicio tiene `GATEWAY_KEY` definida, rechaza con `401 GATEWAY_KEY_INVALIDA` toda petición sin la llave correcta, salvo `GET /health`. |
| **Errores** | Siempre `{ code, message }`. El `message` es para el usuario, en español. El gateway reenvía el status tal cual. |
| **`GET /health`** | Sin auth. `{ service, status: 'UP', version, uptimeS }`. Lo usan Railway y el compose. |
| **Eventos** | Se publican al canal Redis `planazo.events` con el **sobre** `{ id, type, topics[], payload, at }`. `id` UUID v4, `at` epoch ms. **Nunca** incluyen `seq`. |
| **Datos propios** | Cada servicio tiene su Postgres y/o su espacio en Redis. Nadie lee ni escribe la base de otro. |
| **Plantilla** | Los servicios nuevos arrancan desde `planazo-service-template`, que trae health, guard de la llave, decorador de identidad, publicador del bus, Dockerfile y CI. |

Códigos de error que el frontend entiende: `VERSION_CONFLICT` · `SIN_CUPO` · `CAPACIDAD_MENOR` · `PROMO_AGOTADA` · `PROMO_VENCIDA` · `SALA_NO_EXISTE` · `SALA_EN_JUEGO` · `JUGADORES_INSUFICIENTES`. Los demás (`SIN_TOKEN`, `TOKEN_INVALIDO`, `ROL_NO_AUTORIZADO`, `GATEWAY_KEY_INVALIDA`, `SERVICIO_NO_DISPONIBLE`, `RATE_LIMIT`) los muestra como error genérico.

---

## 0 · `api-gateway`

**Qué hace.** Único punto de entrada HTTP. Valida el JWT, extrae la identidad, la pone en headers, firma la petición con `x-gateway-key` y enruta por prefijo. Aplica CORS con lista blanca, rate limit por IP y `helmet`.

**No tiene base de datos ni lógica de negocio.** Si un endpoint necesita decidir algo, está en el servicio equivocado.

```
/api/health          → el propio gateway (sin token)
/api/auth/demo       → el propio gateway: firma el JWT de un usuario semilla
/api/places/*        → booking        /api/promos/*   → promo
/api/reservations/*  → booking        /api/rooms/*    → game
/api/events          → booking        /api/plan       → módulo agent
```

**Variables:** `JWT_SECRET`, `GATEWAY_KEY`, `ALLOWED_ORIGINS`, `BOOKING_URL`, `PROMO_URL`, `GAME_URL`, `ANTHROPIC_API_KEY` (opcional). Con `NODE_ENV=production` se niega a arrancar sin `JWT_SECRET` y `GATEWAY_KEY` de al menos 16 caracteres.

---

## 1 · `booking` — catálogo y disponibilidad

**Responsabilidad.** Fuente de verdad de la disponibilidad. Todo lo que tenga que ver con *cuántos cupos quedan* pasa por aquí. También es el maestro del catálogo (`p1`…`p12`).

**Retos:** CC-3 (cupos limitados) · RT-1 (emite los cambios de disponibilidad)

### Datos (PostgreSQL propio)

```sql
establishments (id, name, category, zone, lat, lng, description, price_level, owner_user_id)
time_slots     (id, establishment_id, starts_at, capacity, taken, version)
reservations   (id, slot_id, user_id, user_name, people, code, status, created_at)
events         (id, establishment_id, title, starts_at, capacity, taken)
```

La columna **`version`** de `time_slots` es el corazón de CC-3. Es un entero que el cliente recibe y devuelve; no se reemplaza por `updated_at`.

### API

| Método | Ruta | Rol | Request | Response |
|---|---|---|---|---|
| `GET` | `/places?zone=&category=` | cliente | — | `Place[]` con `freeSeats` |
| `GET` | `/places/:id` | cliente | — | `PlaceDetail` = `Place` + `slots: Slot[]` + `events: PlaceEvent[]` + `promos: Promo[]` (ver nota) |
| `POST` | `/reservations` | cliente | `{ slotId, people, version }` | `201 Reservation` · `409 VERSION_CONFLICT` · `409 SIN_CUPO` |
| `GET` | `/reservations/mine` | cliente | — | `Reservation[]` del `x-user-id` |
| `GET` | `/places/:id/reservations` | negocio | — | `Reservation[]` del establecimiento (solo si es el suyo) |
| `PATCH` | `/places/:id/slots/:sid` | negocio | `{ capacity, version }` | `200 Slot` · `409 VERSION_CONFLICT` · `409 CAPACIDAD_MENOR` |
| `POST` | `/events` | negocio | `{ placeId, title, startsAt, capacity }` | `201 PlaceEvent` |

Formas exactas de `Place`, `Slot`, `Reservation`, `PlaceEvent` en `frontend/src/lib/types.ts`.

> **Nota sobre `promos` en la ficha.** El frontend espera `promos: Promo[]` dentro de `PlaceDetail`. `booking` **no** conoce las promociones. Decisión: `booking` responde `promos: []` y el frontend, en modo `live`, completa la ficha con `GET /api/promos?zone=` filtrando por `placeId`. Así ningún servicio llama a otro. Este ajuste al frontend es parte del trabajo de integración.

### Mecanismo de CC-3

Una sola sentencia verifica y escribe:

```sql
UPDATE time_slots
   SET taken   = taken + $people,
       version = version + 1
 WHERE id = $slotId
   AND version = $clientVersion        -- nadie lo tocó desde que lo leíste
   AND capacity - taken >= $people     -- y todavía alcanza
RETURNING *;
```

**0 filas → `409`.** Para distinguir el código, se relee la franja: si la `version` cambió es `VERSION_CONFLICT`; si no, `SIN_CUPO`. El `INSERT` en `reservations` va en la **misma transacción**. No hay `SELECT` previo, así que no existe ventana de carrera entre leer y escribir.

La misma regla aplica al panel del negocio: `PATCH` exige `version`, y `capacity < taken` es `CAPACIDAD_MENOR`.

### Eventos

| Evento | Tópicos | Payload |
|---|---|---|
| `PLACE.UPDATE` | `zone:<zona>` | `{ placeId, freeSeats }` |
| `INV.UPDATE` | `place:<id>` | `{ placeId, slot: Slot }` |
| `RESERVE.OK` | `user:<userId>`, `place:<id>` | `Reservation` (plana, sin envolver) |
| `RESERVE.CONFLICT` | `user:<userId>` | `{ slotId, userId, reason }` |

### Lo que NO hace

No abre WebSockets, no conoce las promociones, no sabe que existe el juego.

---

## 2 · `promo` — cupones de stock finito

**Responsabilidad.** El click que compite por un cupón. Nada más, y por eso aguanta el pico sin afectar a nadie.

**Retos:** CC-1 (promociones limitadas) · RT-2 (su lanzamiento se difunde en vivo)

### Datos

```
Redis        promo:{id}:stock      entero, con TTL igual a la duración
PostgreSQL   promos  (id, place_id, place_name, zone, title, discount, initial_stock, expires_at)
             coupons (id, promo_id, user_id, code, claimed_at, redeemed_at)
```

`place_name` y `zone` son **copia de lectura** del catálogo semilla: `promo` no llama a `booking` para completarlos.

### API

| Método | Ruta | Rol | Request | Response |
|---|---|---|---|---|
| `GET` | `/promos?zone=` | cliente | — | `Promo[]` activas |
| `POST` | `/promos` | negocio | `{ placeId, title, discount, stock, durationS }` | `201 Promo` (`placeId` debe ser el de `x-user-place-id`) |
| `POST` | `/promos/:id/claim` | cliente | — | `200 Coupon` · `409 PROMO_AGOTADA` · `409 PROMO_VENCIDA` |
| `GET` | `/promos/mine` | cliente | — | `Coupon[]` |

`Promo`: `{ id, placeId, placeName, zone, title, discount, stock, initialStock, expiresAt }` con `expiresAt` en **epoch ms**. `Coupon`: `{ id, promoId, code, title, discount, placeName, claimedAt }`.

### Mecanismo de CC-1

Script Lua, que Redis ejecuta de forma indivisible:

```lua
-- KEYS[1] = promo:{id}:stock
local s = redis.call('DECR', KEYS[1])
if s < 0 then
  redis.call('INCR', KEYS[1])   -- deshacer: el stock nunca queda bajo cero
  return -1
end
return s
```

**`-1` → `409 PROMO_AGOTADA`** con mensaje explícito: *"Se agotó, te avisamos de la próxima"*. Si la llave no existe (venció el TTL) → `409 PROMO_VENCIDA`.

El cupón se persiste en PostgreSQL **solo después** de que Redis confirmó la unidad. Si el `INSERT` falla, se devuelve la unidad con `INCR` y se responde `500`; nunca un éxito sin cupón.

### Eventos

| Evento | Tópicos | Payload |
|---|---|---|
| `PROMO.PUSH` | `zone:<zona>`, `place:<id>` | `Promo` (plana, sin envolver) |
| `PROMO.WON` | `zone:<zona>`, `place:<id>`, `user:<userId>` | `{ promoId, placeId, stock, winner }` — `stock` restante, `winner` nombre. El `Coupon` va en la respuesta HTTP del claim |
| `PROMO.REJECTED` | `user:<userId>` | `{ promoId, userId, reason }` |
| `PROMO.EXPIRED` | `zone:<zona>`, `place:<id>` | `{ promoId, placeId }` |

### Lo que NO hace

No decide quién ve la promoción, no tiene interfaz de usuario, no lleva event log propio (eso es `realtime`), no expone notificaciones.

---

## 3 · `game` — Snake multijugador

**Responsabilidad.** Salas, simulación de la partida y marcador. El servicio con el perfil de ejecución más distinto de todos.

**Retos:** RT-3 (leaderboard en vivo) · CC-2 (leaderboard concurrente)

### Datos

```
Memoria   rooms[code] = { hostId, status, players[], snakes, food, tick, endsAt }
Redis     leaderboard:{code}   sorted set de la sala
          hall-of-fame         sorted set global de puntajes finales
```

**Nada en PostgreSQL.** El estado es efímero: si el proceso se reinicia, se pierden las partidas en curso y el negocio no se entera.

### API HTTP (por el gateway)

| Método | Ruta | Request | Response |
|---|---|---|---|
| `POST` | `/rooms` | — | `201 Room` con código de 4 letras; el `x-user-id` es el anfitrión |
| `POST` | `/rooms/:code/join` | — | `200 Room` · `404 SALA_NO_EXISTE` · `409 SALA_EN_JUEGO` |
| `POST` | `/rooms/:code/start` | — | `200 Room` · `409 JUGADORES_INSUFICIENTES` (mínimo 2) |
| `GET` | `/rooms/hall-of-fame` | — | `HallEntry[]` = `{ name, score, code, at }[]` ordenado desc |

El nombre del jugador sale de `x-user-name`. `Room`: `{ code, hostId, status: 'lobby'|'playing'|'finished', players: GamePlayer[] }`.

### WebSocket (directo, `NEXT_PUBLIC_GAME_URL`)

```
ws://<game>/rooms/:code/play
→ { type: "AUTH", token }                       primer mensaje; el servidor verifica el JWT
→ { type: "INTENT", dir: "up"|"down"|"left"|"right" }
← { type: "STATE", state: GameState }           ~20 veces por segundo
← { type: "ERROR", message }
```

Sin `AUTH` válido en 5 s, el servidor cierra el socket.

### Mecanismo de RT-3 — servidor autoritativo

```js
setInterval(() => {
  for (const room of activeRooms) {
    room.applyIntents();   // solo direcciones, nunca posiciones
    room.step();           // mover, comer, detectar colisiones
    broadcast(room.code, { type: 'STATE', state: room.serialize() });
  }
}, 50);                    // 20 Hz
```

### Mecanismo de CC-2

```
ZADD      leaderboard:{code} GT {score} {playerId}
ZREVRANGE leaderboard:{code} 0 9 WITHSCORES
```

Nunca se lee y reescribe la tabla completa, así que no existe el *lost update*. **Desempate determinista:**

```
score = puntos × 1.000.000 + (1.000.000 − segundosDesdeInicio)
```

A igual puntaje gana quien llegó primero según el reloj del servidor, y todos ven el mismo orden porque `GameState.leaderboard` ya viene ordenado.

### Eventos

| Evento | Tópicos | Payload |
|---|---|---|
| `ROOM.JOIN` | `room:<code>` | `{ code, playerId, name }` |
| `SNAKE.SCORE` | `room:<code>` | `{ code, playerId, name, score }` |
| `ROUND.END` | `room:<code>` | `{ code, leaderboard, winnerId }` |

---

## 4 · `realtime` — difusión y memoria del sistema

**Responsabilidad.** Mantener las conexiones vivas, saber quién está suscrito a qué, y ser la memoria del sistema.

**Retos:** RT-2 (consistencia ante desconexiones) · RT-1 (difusión por zona)

### Datos

```sql
events (seq        BIGSERIAL PRIMARY KEY,  -- orden global, lo asigna este servicio
        id         UUID UNIQUE,            -- viene del productor; descarta duplicados
        type       TEXT,
        payload    JSONB,
        topics     TEXT[],                 -- a quién se enruta
        created_at TIMESTAMPTZ)
```

En memoria: `conexión → { userId, topics[], lastSeq }`.

### Protocolo con el cliente (`NEXT_PUBLIC_REALTIME_URL`, ruta `/ws`)

```
→ { type: "AUTH", token }                          primer mensaje; el token nunca va en la URL
→ { type: "SUBSCRIBE",   topic: "zone:zona-g" }    al mover el mapa
→ { type: "SUBSCRIBE",   topic: "place:p7" }       al abrir una ficha o el panel
→ { type: "SUBSCRIBE",   topic: "user:u1" }        solo el propio usuario
→ { type: "SUBSCRIBE",   topic: "room:A7X9" }      al entrar a una sala
→ { type: "UNSUBSCRIBE", topic }
→ { type: "RESUME", last_seq: 4821, topics: [...] } al reconectar
← { type: "EVENT",  event: RtEvent }
← { type: "REPLAY", events: RtEvent[] }
```

`RtEvent` = `{ seq, id, type, payload, topics, at }`. **`last_seq` va en snake_case** porque así lo envía el frontend actual; es la única excepción a la convención.

### Cómo recibe lo que difunde

Suscrito al canal `planazo.events`. Por cada sobre: `INSERT ... ON CONFLICT (id) DO NOTHING RETURNING seq`; si insertó, lo emite como `EVENT` a las conexiones cuyos tópicos intersecten `topics`.

### Mecanismo de RT-2 — reenvío selectivo

```sql
SELECT * FROM events
 WHERE seq > $lastSeq
   AND topics && $topicsDelCliente     -- intersección de arreglos
 ORDER BY seq;
```

Solo lo que se perdió, y solo de lo que tiene suscrito. El `id` permite al cliente descartar duplicados si un reintento entrega el mismo evento dos veces.

### Lo que NO hace

Cero lógica de negocio. No sabe qué es un cupo ni una serpiente: solo enruta y recuerda.

---

## 5 · `agent` — de una frase a una ruta (módulo del gateway)

**Responsabilidad.** Traducir lenguaje natural a una propuesta de lugares. **Sin estado propio.** No implementa ningún reto, por eso es el único recortable.

### API

```
POST /api/plan { text }
→ PlanResult { intro, stops: [{ placeId, placeName, category, hour, why }] }
```

### Cómo funciona

Lee `GET /places` de `booking` con la llave del gateway, arma el contexto con los establecimientos y llama al modelo con **salida estructurada** (tool use), para recibir JSON sin interpretar texto libre. Descarta cualquier `placeId` que no exista en el catálogo y completa `placeName` y `category` desde él.

Sin `ANTHROPIC_API_KEY`, o si el modelo falla, responde una **plantilla** con el mismo contrato. Caché opcional en Redis por `(zona, franja, hash de la intención)`.

### Lo que NO hace

**No reserva.** Devuelve la propuesta; si el usuario acepta, el cliente llama a `booking`.

---

## Contrato de eventos (resumen)

| Evento | Lo emite | Tópicos | Lo recibe |
|---|---|---|---|
| `PLACE.UPDATE` | booking | `zone:` | clientes mirando el mapa de esa zona |
| `INV.UPDATE` | booking | `place:` | ficha abierta y panel del negocio |
| `RESERVE.OK` · `RESERVE.CONFLICT` | booking | `user:`, `place:` | el usuario y el panel |
| `PROMO.PUSH` · `PROMO.EXPIRED` | promo | `zone:` | clientes de esa zona |
| `PROMO.WON` · `PROMO.REJECTED` | promo | `user:`, `place:` | el usuario y el panel |
| `ROOM.JOIN` · `SNAKE.SCORE` · `ROUND.END` | game | `room:` | la sala |

Esquema formal de cada payload: `planazo-infra/contracts/events.schema.json`. **Los payloads van planos**, tal como los consume el frontend con `useRtEvent<Promo>` o `useRtEvent<Reservation>`; no se envuelven en `{ promo }` ni `{ reservation }`.

---

## Criterios de terminado propios de este proyecto

1. **Recurso finito** (`booking`, `promo`, `game`): no se da por terminada sin una prueba de carga con peticiones concurrentes y **cero sobreventas**. Los scripts están en `planazo-infra/k6/`.
2. **Tiempo real** (`realtime` y todo lo que difunde): no se da por terminada sin probarla **desconectando y reconectando**, sin pérdida ni duplicados de eventos.

Una historia puede funcionar perfecto para un solo usuario y romperse con diez a la vez.
