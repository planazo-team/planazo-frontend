# Planazo — documento de contexto

Todo lo que alguien necesita saber para entrar al proyecto sin tener que preguntar. Si algo aquí contradice a otro documento, **este manda**, y hay que corregir el otro.

- **Especificación técnica por servicio:** [`arquitectura.md`](arquitectura.md) y el README de cada repo.
- **Estado en vivo:** el panel de arquitectura del equipo (link en el canal del grupo).

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

**Cada servicio expone sus rutas SIN `/api`.**

### 6.2 Identidad

El gateway valida el JWT una sola vez y pasa la identidad en headers. **Ningún servicio HTTP vuelve a validar el token:**

| Header | Contenido |
|---|---|
| `x-user-id` | `u1`…`u6` (cliente), `b1`,`b2`,`b3` (negocio) |
| `x-user-role` | `cliente` \| `negocio` |
| `x-user-place-id` | solo negocio: el establecimiento que administra |

**Excepción:** `game` y `realtime` sí verifican el JWT ellos mismos, porque sus WebSockets no pasan por el gateway. Usan el **mismo `JWT_SECRET`**, y reciben el token **en el primer mensaje del socket**, nunca por query string.

### 6.3 Errores

El gateway reenvía el status tal cual. Los códigos que el frontend entiende:

| Código | Significado | Lo devuelve |
|---|---|---|
| `409` | El recurso se agotó o alguien lo cambió mientras decidías | booking (CC-3), promo (CC-1), game (sala llena) |
| `401` | Falta token o está vencido | gateway |
| `502` | El servicio destino no respondió | gateway |

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

Todos pasan por el bus y llegan al cliente a través de `realtime`.

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
| `frontend` | **Existe y funciona.** Modo `mock` completo: simula los 5 servicios en el navegador, con concurrencia y reconexión simuladas. Falta desplegar en Vercel. |
| `api-gateway` | **Existe y está probado en local.** Auth demo, proxy, rate limit, módulo `agent` con fallback a plantilla. Falta desplegar en Railway. |
| `booking`, `promo`, `game`, `realtime` | Repos creados, **sin código**. |
| Conexión frontend ↔ gateway | **Probada de punta a punta** en local: login real, token emitido, rutas protegidas respondiendo. |

### El modo `mock` es el andamio

El frontend corre hoy sin backend: simula los servicios en el navegador **con los mismos mecanismos** de concurrencia y reconexión. Sirve para dos cosas:

1. Demostrar el flujo completo aunque falten servicios.
2. Ser la referencia de comportamiento: cuando `booking` esté listo, su `409` debe verse igual que el del mock.

Se cambia a `live` con variables de entorno, **sin tocar código**.

---

## 10 · Correr todo en local

```bash
# 1 · frontend  (siempre funciona solo, en modo mock)
cd planazo-frontend/frontend && npm install && npm run dev    # :3000

# 2 · gateway
cd planazo-api-gateway && npm install && npm run start:dev    # :8080

# 3 · conectar el frontend al gateway real
#    planazo-frontend/frontend/.env.local
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_REALTIME_URL=ws://localhost:8081/ws
NEXT_PUBLIC_GAME_URL=ws://localhost:8082
```

Con solo esos dos arriba, el login funciona y las rutas de datos responden `502` controlado — que es lo correcto mientras los servicios no existan, y así se ve qué falta.

Cada servicio que se sume levanta en su puerto y se agrega a las variables del gateway (`BOOKING_URL`, `PROMO_URL`, `GAME_URL`).

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

`game` y `realtime` corren en **una sola instancia** por ahora: tienen estado en memoria (salas, suscripciones) y varias instancias lo repartirían mal.

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
