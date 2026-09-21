# Arquitectura de Planazo — especificación de servicios

Diagrama: [`arquitectura.html`](arquitectura.html) · Visión general: [`../README.md`](../README.md)

Cinco microservicios más un gateway de entrada, cortados por **frontera de consistencia** y **perfil de ejecución**. Este documento es el insumo para arrancar el Sprint 1: datos que posee cada servicio, su API, los eventos que emite y el mecanismo que resuelve su reto.

---

## 0 · `api-gateway`

**Qué hace.** Único punto de entrada HTTP. Valida el JWT fijo, extrae el rol (`cliente` / `negocio`) y enruta por prefijo. Aplica límite de peticiones por IP.

**No tiene base de datos ni lógica de negocio.** Si un endpoint necesita decidir algo, está en el servicio equivocado.

```
/api/places/*        → booking        /api/promos/*   → promo
/api/reservations/*  → booking        /api/rooms/*    → game
/api/events          → booking        /api/plan       → agent
/api/auth/demo       → el propio gateway: firma el JWT fijo de un usuario semilla
```

---

## 1 · `booking` — inventario y reservas

**Responsabilidad.** Fuente de verdad de la disponibilidad. Todo lo que tenga que ver con *cuántos cupos quedan* pasa por aquí.

**Retos:** CC‑3 (cupos limitados) · RT‑1 (emite los cambios de disponibilidad)

### Datos (PostgreSQL propio)

```sql
establishments (id, name, category, lat, lng, zone, photo_url)
time_slots     (id, establishment_id, starts_at, capacity, taken, version)
reservations   (id, slot_id, user_id, people, code, status, created_at)
events         (id, establishment_id, title, starts_at, capacity, taken)
```

La columna **`version`** de `time_slots` es el corazón de CC‑3.

### API

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| `GET` | `/places?zone=&category=` | cliente | Lista para el mapa, con disponibilidad actual |
| `GET` | `/places/:id` | cliente | Ficha con franjas, cupos y la `version` de cada franja |
| `POST` | `/reservations` | cliente | `{slot_id, people, version}` → `201` o `409` |
| `GET` | `/reservations/mine` | cliente | Reservas activas con su código |
| `PATCH` | `/places/:id/slots/:sid` | negocio | Cambia capacidad; exige `version` |
| `POST` | `/events` | negocio | Publica un evento con cupo máximo |

### Mecanismo de CC‑3

Una sola sentencia verifica y escribe:

```sql
UPDATE time_slots
   SET taken   = taken + $people,
       version = version + 1
 WHERE id = $slot_id
   AND version = $client_version        -- nadie lo tocó desde que lo leíste
   AND capacity - taken >= $people      -- y todavía alcanza
RETURNING version;
```

**0 filas → `409 CONFLICT`.** El cliente relee y decide si reintenta. No hay `SELECT` previo, así que no existe ventana de carrera entre leer y escribir.

La misma regla aplica al panel del negocio: si dos dispositivos del staff editan la misma franja, el segundo recibe `409` y debe releer.

### Eventos

`PLACE.UPDATE` · `RESERVE.OK` · `RESERVE.CONFLICT` · `INV.UPDATE`

### Lo que NO hace

No abre WebSockets, no conoce las promociones, no sabe que existe el juego.

---

## 2 · `promo` — cupones de stock finito

**Responsabilidad.** El click que compite por un cupón. Nada más, y por eso aguanta el pico sin afectar a nadie.

**Retos:** CC‑1 (promociones limitadas) · RT‑2 (su lanzamiento se difunde en vivo)

### Datos

```
Redis        promo:{id}:stock      entero, con TTL igual a la duración
PostgreSQL   promos  (id, establishment_id, discount, stock_inicial, expires_at)
             coupons (id, promo_id, user_id, code, redeemed_at)
```

### API

| Método | Ruta | Rol | Qué hace |
|---|---|---|---|
| `POST` | `/promos` | negocio | `{discount, stock, duration_s}` — lanza la promoción |
| `POST` | `/promos/:id/claim` | cliente | `200 {code}` o `409` |
| `GET` | `/promos/mine` | cliente | Cupones del usuario |

### Mecanismo de CC‑1

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

**`-1` → `409`** con mensaje explícito: *"se agotó, te avisamos de la próxima"*. Nunca un error genérico ni un éxito falso — es criterio de aceptación de la historia.

El cupón se persiste en PostgreSQL **solo después** de que Redis confirmó la unidad.

### Eventos

`PROMO.PUSH` · `PROMO.WON` · `PROMO.REJECTED` · `PROMO.EXPIRED`

### Lo que NO hace

No decide quién ve la promoción. Publica `PROMO.PUSH` con la zona y `realtime` la enruta.

---

## 3 · `game` — Snake multijugador

**Responsabilidad.** Salas, simulación de la partida y marcador. El servicio con el perfil de ejecución más distinto de todos.

**Retos:** RT‑3 (leaderboard en vivo) · CC‑2 (leaderboard concurrente)

### Datos

```
Memoria   rooms[code] = { players[], snakes[], food[], tickId }
Redis     leaderboard:{roomId}      sorted set
```

**Nada en PostgreSQL.** El estado es efímero: si el proceso se reinicia, se pierden las partidas en curso y el negocio no se entera.

### API

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/rooms` | Crea la sala y devuelve un código de 4 letras |
| `POST` | `/rooms/:code/join` | Entra y recibe la lista de quién está dentro |
| `POST` | `/rooms/:code/start` | Arranca si hay al menos 2 jugadores |
| `WS` | `/rooms/:code/play` | Recibe intenciones, emite el estado |

### Mecanismo de RT‑3 — servidor autoritativo

```js
setInterval(() => {
  for (const room of activeRooms) {
    room.applyIntents();   // solo direcciones, nunca posiciones
    room.step();           // mover, comer, detectar colisiones
    broadcast(room.code, room.serialize());
  }
}, 50);                    // 20 Hz
```

El cliente envía **intenciones de movimiento, no posiciones**. Así nadie manipula la partida desde el navegador.

### Mecanismo de CC‑2

Escritura atómica sobre una estructura ordenada:

```
ZADD      leaderboard:{roomId} GT {score} player:{id}
ZREVRANGE leaderboard:{roomId} 0 9 WITHSCORES
```

Nunca se lee y reescribe la tabla completa, así que no existe el *lost update*.

**Desempate determinista** con un score compuesto:

```
score = puntos × 1.000.000 + (1.000.000 − segundos_desde_inicio)
```

A igual puntaje gana quien llegó primero **según el reloj del servidor**, y todos los clientes ven el mismo orden.

### Eventos

`ROOM.JOIN` · `SNAKE.SCORE` · `SNAKE.DEATH` · `ROUND.END`

---

## 4 · `realtime` — difusión y memoria del sistema

**Responsabilidad.** Mantener las conexiones vivas, saber quién está suscrito a qué, y ser la memoria del sistema.

**Retos:** RT‑2 (consistencia ante desconexiones) · RT‑1 (difusión por zona)

### Datos

```sql
events (seq        BIGSERIAL PRIMARY KEY,  -- orden global
        id         UUID UNIQUE,            -- para descartar duplicados
        type       TEXT,
        payload    JSONB,
        topics     TEXT[],                 -- a quién se enruta
        created_at TIMESTAMPTZ)
```

Los **tópicos** generalizan el enrutamiento: `zone:zona-g` (quien mira el mapa), `place:p7` (quien tiene la ficha abierta o el panel de ese negocio), `user:u1` (eventos personales) y `room:A7X9` (una sala). Un mismo evento puede ir a varios: un `INV.UPDATE` de `p7` va a `place:p7`, y su resumen `PLACE.UPDATE` a `zone:zona-t`.

En memoria: `conexión → { tópicos[], last_seq }`

### Protocolo con el cliente

```
→ { type: "AUTH", token }                        primer mensaje; el token nunca va en la URL
→ { type: "SUBSCRIBE",   topic: "zone:zona-g" }  al mover el mapa
→ { type: "SUBSCRIBE",   topic: "room:A7X9" }    al entrar a una sala
→ { type: "UNSUBSCRIBE", topic }
→ { type: "RESUME", last_seq: 4821, topics }     al reconectar
← { type: "EVENT",  event: { seq, id, type, payload, topics, at } }
← { type: "REPLAY", events: [...] }
```

### Mecanismo de RT‑2 — reenvío selectivo

```sql
SELECT * FROM events
 WHERE seq > $last_seq
   AND topics && $topics_del_cliente     -- intersección de arreglos
 ORDER BY seq;
```

Solo lo que se perdió, y solo de lo que tiene suscrito. El `id` UUID permite al cliente descartar duplicados si un reintento entrega el mismo evento dos veces.

### Cómo recibe lo que difunde

Está suscrito al bus. Cada evento que llega lo persiste —ahí obtiene su `seq`— y lo emite a los clientes suscritos a esa zona o esa sala.

### Lo que NO hace

Cero lógica de negocio. No sabe qué es un cupo ni una serpiente: solo enruta y recuerda.

---

## 5 · `agent` — de una frase a una ruta

**Responsabilidad.** Traducir lenguaje natural a una propuesta de lugares. **Sin estado propio.** No implementa ningún reto, por eso es el único recortable.

### API

```
POST /plan
  { text: "salida con mi novia, algo tranquilo", lat, lng }
→ { stops: [ { place_id, hour, why } ] }
```

### Cómo funciona

Lee el catálogo de `booking` por HTTP en modo solo lectura, arma el contexto con los establecimientos cercanos disponibles y llama al modelo con **salida estructurada**, para recibir JSON directamente sin interpretar texto libre.

**Caché en Redis** por `(zona, franja, hash de la intención)`: muchos usuarios piden planes parecidos a la misma hora, y cada llamada al modelo cuesta.

### Lo que NO hace

**No reserva.** Devuelve la propuesta; si el usuario acepta, el cliente llama a `booking`. Esa separación es la que permite que el agente caiga a plantillas sin romper nada.

---

## Contrato de eventos

| Evento | Lo emite | Lo recibe |
|---|---|---|
| `PLACE.UPDATE` | booking | clientes de esa zona |
| `INV.UPDATE` | booking | clientes con esa ficha abierta y el panel |
| `RESERVE.OK` · `RESERVE.CONFLICT` | booking | el usuario y el panel del negocio |
| `PROMO.PUSH` | promo | clientes de esa zona |
| `PROMO.WON` · `PROMO.REJECTED` | promo | el usuario y el panel del negocio |
| `PROMO.EXPIRED` | promo | clientes de esa zona |
| `ROOM.JOIN` · `SNAKE.SCORE` · `ROUND.END` | game | la sala |

Todos pasan por el bus y llegan al cliente a través de `realtime`.

---

## Criterios de terminado propios de este proyecto

Dos criterios del Definition of Done aplican específicamente a estos servicios y **no son opcionales**:

1. **Recurso finito** (`booking`, `promo`, `game`): no se da por terminada sin una prueba de carga con peticiones concurrentes y **cero sobreventas**.
2. **Tiempo real** (`realtime` y todo lo que difunde): no se da por terminada sin probarla **desconectando y reconectando**, sin pérdida ni duplicados de eventos.

Una historia puede funcionar perfecto para un solo usuario y romperse con diez a la vez.
