# Arquitectura de Planazo — especificación de servicios

Diagramas: [`diagramas.md`](diagramas.md) · Dominios: [`dominios.md`](dominios.md) · Seguridad: [`seguridad.md`](seguridad.md) · Visión general: [`../README.md`](../README.md)

Cinco microservicios más un gateway de entrada, cortados por **frontera de consistencia** y **perfil de ejecución**. Este documento es el insumo para programar cada servicio: datos que posee, su API, los eventos que emite y el mecanismo que resuelve su reto.

> **Convención de nombres.** Todo lo que viaja por HTTP o WebSocket va en **`camelCase`** (`slotId`, `durationS`, `placeId`), porque es lo que el frontend ya envía y recibe (`frontend/src/lib/types.ts`). Las columnas de base de datos van en `snake_case` y cada servicio traduce al responder. La tabla completa de rutas y cuerpos está en `planazo-infra/contracts/http.md`.

---

## Reglas comunes a todos los servicios

| Regla | Detalle |
|---|---|
| **Sin prefijo `/api`** | El gateway recibe `/api/places` y reenvía `/places`. |
| **Identidad por headers** | `x-user-id`, `x-user-name` (URL-encoded), `x-user-role` (`cliente` \| `negocio`), `x-user-place-id` (solo negocio). Los pone el gateway a partir del JWT. **No validar el JWT** en HTTP. Excepción: `game` recibe el `Authorization: Bearer` reenviado y lo valida él. |
| **Llave del gateway** | Header `x-gateway-key`. Si el servicio tiene `GATEWAY_KEY` definida, rechaza con `401 GATEWAY_KEY_INVALIDA` toda petición sin la llave correcta, salvo `GET /health`. |
| **Errores** | Siempre `{ code, message }`. El `message` es para el usuario, en español. El gateway reenvía el status tal cual. |
| **`GET /health`** | Sin auth. `{ service, status: 'UP', version, uptimeS }`. Lo usan Railway y el compose. |
| **Eventos** | Se publican al canal Redis `planazo.events` con el **sobre** `{ id, type, topics[], payload, at }`. `id` UUID v4, `at` epoch ms. **Nunca** incluyen `seq`. |
| **Datos propios** | Cada servicio tiene su Postgres y/o su espacio en Redis. Nadie lee ni escribe la base de otro. |
| **Plantilla** | `booking`, `promo` y `realtime` arrancan desde `planazo-service-template`, que trae health, guard de la llave, decorador de identidad, publicador del bus, Dockerfile y CI. `game` es Java + Spring Boot con arquitectura hexagonal (ver su `ARQUITECTURA.md`). |

Códigos de error que el frontend entiende: `VERSION_CONFLICT` · `SIN_CUPO` · `CAPACIDAD_MENOR` · `PROMO_AGOTADA` · `PROMO_VENCIDA` · `SALA_NO_EXISTE` · `SALA_EN_JUEGO` · `JUGADORES_INSUFICIENTES`. Los demás (`SIN_TOKEN`, `TOKEN_INVALIDO`, `ROL_NO_AUTORIZADO`, `GATEWAY_KEY_INVALIDA`, `SERVICIO_NO_DISPONIBLE`, `RATE_LIMIT`) los muestra como error genérico.

---

## 0 · `api-gateway`

**Qué hace.** Único punto de entrada HTTP. Valida el JWT, extrae la identidad, la pone en headers, firma la petición con `x-gateway-key` y enruta por prefijo. Aplica CORS con lista blanca, rate limit por IP y `helmet`.

**No tiene base de datos ni lógica de negocio.** Si un endpoint necesita decidir algo, está en el servicio equivocado.

```
/api/health          → el propio gateway (sin token)
/api/auth/demo       → el propio gateway: firma el JWT de un usuario semilla
/api/places/*        → booking        /api/promos/*   → promo
/api/reservations/*  → booking        /api/salas/* /api/leaderboard /api/historico/*
/api/events          → booking            → game, como /api/v1/..., con Authorization: Bearer
/api/plan            → módulo agent
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

> **Estado al 8 de octubre:** `booking` guarda este modelo **en memoria** (`src/booking/booking.service.ts`): la comprobación de versión y la escritura ocurren en el mismo paso síncrono, sin `await` entre ellas, que dentro de un proceso de Node equivale al `UPDATE` de abajo. Un redespliegue reinicia las reservas. Pasar a PostgreSQL no cambia la regla.

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
Redis        promo:{id}:stock      entero, con TTL igual a la duración (lo único que se descuenta)
Memoria      promos y cupones emitidos (estado al 8 de octubre; PostgreSQL pendiente)
PostgreSQL   promos  (id, place_id, place_name, zone, title, discount, initial_stock, expires_at)   ← objetivo
             coupons (id, promo_id, user_id, code, claimed_at, redeemed_at)
```

Sin `REDIS_URL` el servicio usa un contador en memoria con la misma regla, solo para desarrollo. Al arrancar lanza tres promociones de ejemplo (`SEED_PROMOS=false` lo desactiva).

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

**Responsabilidad.** Salas, simulación de la partida y marcador. El servicio con el perfil de ejecución más distinto de todos, y el único que no es NestJS: **Java 21 + Spring Boot 3**, arquitectura hexagonal (`domain` / `application` / `infrastructure`), verificada con ArchUnit. Su diseño completo está en `planazo-game/ARQUITECTURA.md`.

**Retos:** RT-3 (partida autoritativa a 20 Hz) · CC-2 (marcador concurrente)

### Datos

```
Memoria     un SalaRuntime por sala: el agregado Sala (serpientes, comida, tick), dueño exclusivo
PostgreSQL  esquema `minijuego` (Flyway): salas (catálogo fijo), resultados_partida, puntajes_jugador
Redis       db 1 · leaderboard global como sorted set (CC-2)
```

Las salas son **pre-existentes y de cupo fijo** (`sala-001` Bogotá ×6, `sala-002` Medellín ×6, `sala-003` Cali ×6, `sala-004` Cartagena ×4). No se crean salas: se entra a una. Cuando se llena, cuenta regresiva de 3 s y arranca sola; al terminar vuelve a esperar con los mismos jugadores (revancha).

### API HTTP (por el gateway, con `Authorization: Bearer`)

| Frontend pide | game recibe | Response |
|---|---|---|
| `GET /api/salas` | `GET /api/v1/salas` | `{ data: ResumenSala[] }` |
| `GET /api/salas/:id` | `GET /api/v1/salas/:id` | `{ data: ResumenSala }` |
| `POST /api/salas/:id/jugadores` | `POST /api/v1/salas/:id/jugadores` | `201 { data: ResumenSala }` · `409 SALA_LLENA` |
| `DELETE /api/salas/:id/jugadores/:jugadorId` | ídem | `204`; `403` si no es el propio jugador |
| `GET /api/leaderboard?limite=10` | `GET /api/v1/leaderboard` | `{ data: EntradaLeaderboard[] }` |
| `GET /api/historico/mio` | `GET /api/v1/historico/mio` | `{ data: ResultadoPartida[] }` |

`ResumenSala = { id, codigo, capacidad, cantidadJugadores, estado, nombresJugadores[] }` con `estado` en `ESPERANDO_JUGADORES | CUENTA_REGRESIVA | EN_CURSO | FINALIZADA`. Los errores son `{ codigo, mensaje }`. El jugador y su nombre salen del JWT (`sub`, `nombre`), no de `x-user-*`. Tipos completos en `frontend/src/lib/game/types.ts`.

### Comandos (STOMP directo, `NEXT_PUBLIC_GAME_URL`)

Endpoint `/ws` publicado con SockJS; el transporte WebSocket nativo está en `/ws/websocket`. El JWT va en el header `Authorization: Bearer` del frame `CONNECT`; sin él el `CONNECT` se rechaza.

```
SUBSCRIBE /user/queue/errores                  errores propios { codigo, mensaje }
SEND      /app/salas/{id}/registrar-sesion     tras unirse: asocia el socket al jugador y, si estaba congelado, lo reconecta (SNK-07)
SEND      /app/salas/{id}/mover                { direccion: "ARRIBA" | "ABAJO" | "IZQUIERDA" | "DERECHA" }
```

### Estado (por el bus, llega vía `realtime`)

Desde el cambio de Camilo, `game` no difunde por `/topic/salas/{id}` sino que publica al bus y `realtime` reparte:

| Evento | Tópico | Payload |
|---|---|---|
| `LOBBY.ROOMS_UPDATE` | `salas` | `ResumenSala[]` |
| `GAME.STATE_UPDATE` | `salas:<salaId>` | `EstadoJuegoDTO = { salaId, salaCodigo, estado, capacidad, segundosCuentaRegresiva, anchoTablero, altoTablero, jugadores[], comida, tiempoRestanteSegundos, resultado }` |
| `GAME.PARTIDA_FINALIZADA` | `global` | `ResultadoPartida` |

El frontend se suscribe por `realtime` a `salas` y a `salas:<id>` y usa STOMP solo para los comandos. Un cliente que pierde el socket queda `DESCONECTADA_CONGELADA` 15 s y puede volver.

### Mecanismo de RT-3 — un actor por sala

Cada sala tiene exactamente un `SalaRuntime`, dueño de su agregado. Los movimientos entran a una `ConcurrentLinkedQueue` que solo drena el hilo del tick (20 por segundo, `ScheduledExecutorService`, solo mientras hay partida); unirse, salir y reconectar toman un único `ReentrantLock`, nunca anidado. Las respuestas hacia afuera son snapshots inmutables (`ResumenSala`, `EstadoJuegoDTO`), nunca el agregado vivo.

### Mecanismo de CC-2

Al terminar la partida, cada puntaje se suma al sorted set global de Redis (`ZINCRBY`) y el resultado completo se persiste en PostgreSQL en la misma operación de cierre. El leaderboard se lee del sorted set ya ordenado; nunca se lee y reescribe la tabla completa, así que no hay *lost update* aunque varias salas terminen a la vez.

### Pendientes para producción

CORS permite cualquier origen; `POST /api/v1/auth/dev-token` sigue activo; `k6/cc2-game-score.js` todavía describe el protocolo anterior y hay que reescribirlo a STOMP.

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
→ { type: "SUBSCRIBE",   topic: "salas" }          al mirar la lista de salas del juego
→ { type: "SUBSCRIBE",   topic: "salas:sala-004" } al entrar a una sala
→ { type: "UNSUBSCRIBE", topic }
→ { type: "RESUME", last_seq: 4821, topics: [...] } al reconectar
← { type: "EVENT",  event: RtEvent }
← { type: "REPLAY", events: RtEvent[] }
```

`RtEvent` = `{ seq, id, type, payload, topics, at }`. **`last_seq` va en snake_case** porque así lo envía el frontend actual; es la única excepción a la convención.

### Cómo recibe lo que difunde

Suscrito al canal `planazo.events`. Por cada sobre: `INSERT ... ON CONFLICT (id) DO NOTHING RETURNING seq`; si insertó, lo emite como `EVENT` a las conexiones cuyos tópicos intersecten `topics`.

> Hoy eso incluye los `GAME.STATE_UPDATE` de `game`, 20 por segundo por sala en partida. Es una decisión abierta: persistirlos da reanudación también al juego, pero llena la tabla rápido. La alternativa es difundirlos sin `INSERT`.

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
| `LOBBY.ROOMS_UPDATE` | game | `salas` | quien mira la lista de salas |
| `GAME.STATE_UPDATE` | game | `salas:<id>` | los jugadores de la sala, cada tick |
| `GAME.PARTIDA_FINALIZADA` | game | `global` | resultado de la partida |

Esquema formal de cada payload: `planazo-infra/contracts/events.schema.json`. **Los payloads van planos**, tal como los consume el frontend con `useRtEvent<Promo>` o `useRtEvent<Reservation>`; no se envuelven en `{ promo }` ni `{ reservation }`.

---

## Criterios de terminado propios de este proyecto

1. **Recurso finito** (`booking`, `promo`, `game`): no se da por terminada sin una prueba de carga con peticiones concurrentes y **cero sobreventas**. Los scripts están en `planazo-infra/k6/`.
2. **Tiempo real** (`realtime` y todo lo que difunde): no se da por terminada sin probarla **desconectando y reconectando**, sin pérdida ni duplicados de eventos.

Una historia puede funcionar perfecto para un solo usuario y romperse con diez a la vez.
