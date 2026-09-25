# Planazo — diagramas de arquitectura

Todos los diagramas están en [Mermaid](https://mermaid.js.org/) y GitHub los renderiza solo. Si cambias la arquitectura, cambia el diagrama en el mismo PR.

- Dominios y fronteras: [`dominios.md`](dominios.md) · Especificación por servicio: [`arquitectura.md`](arquitectura.md) · Seguridad: [`seguridad.md`](seguridad.md)

---

## 1 · Contexto del sistema

Quién usa Planazo y de qué sistemas externos depende.

```mermaid
flowchart TB
  classDef persona fill:#0f2f66,stroke:#0f2f66,color:#fff
  classDef sistema fill:#1f4b99,stroke:#0f2f66,color:#fff
  classDef externo fill:#e8eef8,stroke:#5b7db1,color:#0f2f66,stroke-dasharray: 4 3

  C([Cliente<br/>busca plan, reserva, reclama cupón, juega]):::persona
  N([Establecimiento<br/>edita cupos, publica eventos, lanza promos]):::persona

  P[["Planazo<br/>mapa en tiempo real de Zona G y Zona T"]]:::sistema

  CL[Claude API<br/>arma el plan a partir de una frase]:::externo
  OSM[OpenStreetMap / CARTO<br/>teselas del mapa]:::externo

  C -->|web móvil| P
  N -->|panel web| P
  P -->|salida estructurada| CL
  P -.->|solo el navegador| OSM
```

---

## 2 · Componentes (contenedores)

Un contenedor por proceso desplegable. Las líneas continuas son HTTP; las punteadas, WebSocket; las gruesas, el bus de eventos.

```mermaid
flowchart TB
  classDef ui fill:#e8eef8,stroke:#1f4b99,color:#0f2f66
  classDef svc fill:#1f4b99,stroke:#0f2f66,color:#fff
  classDef gw fill:#5b7db1,stroke:#0f2f66,color:#fff
  classDef db fill:#f4f6fa,stroke:#5b7db1,color:#0f2f66
  classDef bus fill:#fff3cd,stroke:#b58900,color:#5c4400

  subgraph Navegador
    FE[frontend<br/>Next.js · Vercel<br/>vista cliente + panel negocio]:::ui
  end

  subgraph Borde["Borde (público)"]
    GW["api-gateway<br/>NestJS · :8080<br/>JWT · CORS · rate limit · proxy"]:::gw
    AG["agent<br/>módulo del gateway<br/>/api/plan"]:::gw
    GW --- AG
  end

  subgraph Nucleo["Servicios de dominio (red privada salvo los WebSocket)"]
    BK["booking<br/>NestJS · :3001<br/>CC-3 · RT-1"]:::svc
    PR["promo<br/>Node · :3002<br/>CC-1"]:::svc
    GM["game<br/>NestJS · :3003 / ws :8082<br/>RT-3 · CC-2"]:::svc
    RT["realtime<br/>NestJS · ws :8081<br/>RT-2 · RT-1"]:::svc
  end

  subgraph Datos
    PG1[(PostgreSQL<br/>booking)]:::db
    PG2[(PostgreSQL<br/>promo)]:::db
    PG3[(PostgreSQL<br/>realtime<br/>event log)]:::db
    RD[(Redis<br/>stock · leaderboard · bus)]:::db
  end

  BUS{{"bus de eventos<br/>Redis pub/sub · canal planazo.events"}}:::bus

  FE -->|"HTTP /api/*"| GW
  FE -.->|ws AUTH · SUBSCRIBE · RESUME| RT
  FE -.->|ws AUTH · INTENT → STATE| GM

  GW -->|"/places /reservations /events<br/>x-user-* + x-gateway-key"| BK
  GW -->|"/promos"| PR
  GW -->|"/rooms"| GM
  AG -->|GET /places lectura| BK

  BK --- PG1
  PR --- PG2
  PR --- RD
  GM --- RD
  RT --- PG3

  BK ==>|PLACE.UPDATE INV.UPDATE RESERVE.*| BUS
  PR ==>|PROMO.*| BUS
  GM ==>|ROOM.JOIN SNAKE.SCORE ROUND.END| BUS
  BUS ==>|consume todo y asigna seq| RT
```

Lectura rápida:

- **Dos puertas de entrada**, no una: HTTP por el gateway; WebSocket directo a `realtime` y `game`. Un proxy HTTP en medio de un canal de 20 Hz solo suma latencia.
- **Ningún servicio le habla a otro** salvo `agent → booking` (lectura). Todo lo demás son eventos.
- **Un Redis** hace tres papeles en el MVP (contador de `promo`, sorted set de `game`, bus). Si el pico de `promo` lo estorba, se separa el bus; hasta entonces es complejidad que no compra nada.

---

## 3 · Despliegue

```mermaid
flowchart LR
  classDef ext fill:#e8eef8,stroke:#1f4b99,color:#0f2f66
  classDef pub fill:#5b7db1,stroke:#0f2f66,color:#fff
  classDef priv fill:#1f4b99,stroke:#0f2f66,color:#fff
  classDef db fill:#f4f6fa,stroke:#5b7db1,color:#0f2f66

  U([Navegador del usuario]):::ext

  subgraph Vercel
    FE[frontend<br/>Root Directory = frontend<br/>NEXT_PUBLIC_API_MODE=live]:::ext
  end

  subgraph Railway["Railway · un proyecto · variables compartidas JWT_SECRET · GATEWAY_KEY · BUS_URL"]
    direction TB
    subgraph Publico["Con dominio público"]
      GW[api-gateway]:::pub
      RT[realtime · 1 réplica]:::pub
      GM[game · 1 réplica<br/>solo el puerto WS es público]:::pub
    end
    subgraph Privado["Solo red privada *.railway.internal"]
      BK[booking]:::priv
      PR[promo]:::priv
    end
    PG1[(Postgres booking)]:::db
    PG2[(Postgres promo)]:::db
    PG3[(Postgres realtime)]:::db
    RD[(Redis)]:::db
  end

  U -->|https| FE
  U -->|"https /api"| GW
  U -.->|"wss /ws"| RT
  U -.->|"wss /rooms/:code/play"| GM
  GW -->|http privado| BK
  GW -->|http privado| PR
  GW -->|http privado| GM
  BK --- PG1
  PR --- PG2
  PR --- RD
  GM --- RD
  RT --- PG3
  BK & PR & GM -->|publish| RD
  RD -->|subscribe| RT
```

Decisiones:

- `booking` y `promo` **no tienen dominio público**: solo el gateway los alcanza por la red privada de Railway. Aunque alguien conociera su URL, sin `x-gateway-key` responden `401`.
- `game` necesita dominio público por el WebSocket; su HTTP también exige `x-gateway-key`, así que las rutas `/rooms` solo funcionan a través del gateway.
- `realtime` y `game` con **una réplica**: tienen estado en memoria (suscripciones, salas).
- `JWT_SECRET` y `GATEWAY_KEY` son **variables compartidas** del proyecto de Railway, no se pegan en cada servicio a mano ni viajan por chat.

---

## 4 · Secuencias de los seis retos

### 4.1 · CC-3 · Reservar el último cupo (lock optimista)

```mermaid
sequenceDiagram
  autonumber
  actor A as Cliente A
  actor B as Cliente B
  participant GW as api-gateway
  participant BK as booking
  participant DB as PostgreSQL
  participant BUS as bus
  participant RT as realtime

  A->>GW: GET /api/places/p1
  GW->>BK: GET /places/p1 (x-user-id u1)
  BK-->>A: slots[{ id s1, capacity 10, taken 9, version 7 }]
  B->>GW: GET /api/places/p1
  GW->>BK: GET /places/p1
  BK-->>B: slots[{ id s1, ..., version 7 }]

  A->>GW: POST /api/reservations { slotId s1, people 1, version 7 }
  GW->>BK: POST /reservations
  BK->>DB: UPDATE time_slots SET taken=taken+1, version=8<br/>WHERE id=s1 AND version=7 AND capacity-taken>=1
  DB-->>BK: 1 fila
  BK->>DB: INSERT reservations (misma transacción)
  BK-->>A: 201 Reservation { code }
  BK->>BUS: RESERVE.OK [user:u1, place:p1] · INV.UPDATE [place:p1] · PLACE.UPDATE [zone:zona-g]
  BUS->>RT: persiste con seq, difunde

  B->>GW: POST /api/reservations { slotId s1, people 1, version 7 }
  GW->>BK: POST /reservations
  BK->>DB: UPDATE ... WHERE id=s1 AND version=7 ...
  DB-->>BK: 0 filas
  BK-->>B: 409 { code VERSION_CONFLICT, message "Alguien reservó mientras decidías" }
  RT-->>B: EVENT INV.UPDATE (la ficha se actualiza sola: version 8, taken 10)
```

### 4.2 · CC-1 · Reclamar un cupón de stock finito (decremento atómico)

```mermaid
sequenceDiagram
  autonumber
  participant N as Negocio b1
  participant GW as api-gateway
  participant PR as promo
  participant RD as Redis
  participant PG as PostgreSQL
  participant BUS as bus
  participant RT as realtime
  actor C as 200 clientes

  N->>GW: POST /api/promos { placeId p7, title, discount "2x1", stock 10, durationS 120 }
  GW->>PR: POST /promos (x-user-role negocio, x-user-place-id p7)
  PR->>PG: INSERT promos
  PR->>RD: SET promo:{id}:stock 10 EX 120
  PR->>BUS: PROMO.PUSH [zone:zona-t]
  BUS->>RT: seq, difunde a zone:zona-t
  RT-->>C: EVENT PROMO.PUSH (aparece el toast)

  par 200 clicks casi simultáneos
    C->>GW: POST /api/promos/{id}/claim
    GW->>PR: POST /promos/{id}/claim
    PR->>RD: EVAL lua: DECR; si < 0 → INCR y -1
    alt quedó unidad (>= 0)
      PR->>PG: INSERT coupons
      PR->>BUS: PROMO.WON [user:uX, place:p7]
      PR-->>C: 200 Coupon { code }
    else se agotó (-1)
      PR->>BUS: PROMO.REJECTED [user:uX]
      PR-->>C: 409 { code PROMO_AGOTADA, message "Se agotó, te avisamos de la próxima" }
    end
  end
  Note over PR,RD: Exactamente 10 × 200 y 190 × 409. Nunca 11 cupones.
```

### 4.3 · RT-2 · Desconexión y reanudación sin pérdida ni duplicados

```mermaid
sequenceDiagram
  autonumber
  actor C as Cliente
  participant RT as realtime
  participant DB as event log
  participant BUS as bus

  C->>RT: ws connect
  C->>RT: { type AUTH, token }
  C->>RT: { type SUBSCRIBE, topic zone:zona-g }
  BUS->>RT: sobre { id, type PROMO.PUSH, topics [zone:zona-g], payload, at }
  RT->>DB: INSERT events → seq 4820
  RT-->>C: { type EVENT, event { seq 4820, id, ... } }
  Note over C: guarda lastSeq = 4820

  C--xRT: se corta la señal
  BUS->>RT: PLACE.UPDATE → seq 4821 (zone:zona-g)
  BUS->>RT: SNAKE.SCORE → seq 4822 (room:A7X9)
  BUS->>RT: PROMO.EXPIRED → seq 4823 (zone:zona-g)

  C->>RT: ws reconnect · { type AUTH, token }
  C->>RT: { type RESUME, last_seq 4820, topics [zone:zona-g] }
  RT->>DB: SELECT * FROM events WHERE seq > 4820 AND topics && {zone:zona-g} ORDER BY seq
  DB-->>RT: [4821, 4823]
  RT-->>C: { type REPLAY, events [4821, 4823] }
  Note over C: 4822 no era suyo. Si 4821 llegara dos veces, lo descarta por id.
```

### 4.4 · RT-3 + CC-2 · Partida autoritativa a 20 Hz y marcador concurrente

```mermaid
sequenceDiagram
  autonumber
  actor J1 as Jugador 1
  actor J2 as Jugador 2
  participant GW as api-gateway
  participant GM as game
  participant RD as Redis
  participant BUS as bus

  J1->>GW: POST /api/rooms
  GW->>GM: POST /rooms (x-user-id u1, x-user-name "Juan Diego")
  GM-->>J1: Room { code A7X9, status lobby }
  J2->>GW: POST /api/rooms/A7X9/join
  GW->>GM: POST /rooms/A7X9/join
  GM->>BUS: ROOM.JOIN [room:A7X9]
  GM-->>J2: Room { players [u1, u2] }

  J1->>GM: ws /rooms/A7X9/play · { type AUTH, token }
  J2->>GM: ws /rooms/A7X9/play · { type AUTH, token }
  J1->>GW: POST /api/rooms/A7X9/start
  GW->>GM: POST /rooms/A7X9/start (>= 2 jugadores)

  loop cada 50 ms (20 Hz)
    J1->>GM: { type INTENT, dir up }
    J2->>GM: { type INTENT, dir left }
    GM->>GM: applyIntents() · step() · colisiones
    opt alguien comió
      GM->>RD: ZADD leaderboard:A7X9 GT score player:u1
      GM->>RD: ZREVRANGE leaderboard:A7X9 0 9 WITHSCORES
    end
    GM-->>J1: { type STATE, state { snakes, food, leaderboard ordenado } }
    GM-->>J2: { type STATE, state }
  end

  GM->>RD: ZADD hall-of-fame GT ...
  GM->>BUS: ROUND.END [room:A7X9] { leaderboard, winnerId }
  Note over GM,RD: score = puntos × 1e6 + (1e6 − segundos). Mismo orden para todos.
```

### 4.5 · Planificación · de una frase a una ruta

```mermaid
sequenceDiagram
  autonumber
  actor C as Cliente
  participant GW as api-gateway
  participant AG as agent (módulo)
  participant BK as booking
  participant CL as Claude API

  C->>GW: POST /api/plan { text "algo tranquilo con mi novia" }
  GW->>AG: buildPlan(text)
  AG->>BK: GET /places (x-gateway-key)
  BK-->>AG: catálogo con freeSeats
  alt hay ANTHROPIC_API_KEY
    AG->>CL: messages + tool proponer_ruta (salida estructurada)
    CL-->>AG: { intro, stops [{ placeId, hour, why }] }
    AG->>AG: descarta placeId que no existan, completa placeName y category
  else sin llave o falla
    AG->>AG: plantilla: 2 lugares del catálogo
  end
  AG-->>C: PlanResult { intro, stops [{ placeId, placeName, category, hour, why }] }
  Note over C: si acepta, la app llama a booking. El agente nunca reserva.
```

---

## 5 · Anatomía de un evento

```mermaid
flowchart LR
  classDef p fill:#1f4b99,stroke:#0f2f66,color:#fff
  classDef e fill:#fff3cd,stroke:#b58900,color:#5c4400
  classDef r fill:#5b7db1,stroke:#0f2f66,color:#fff
  classDef c fill:#e8eef8,stroke:#1f4b99,color:#0f2f66

  P[productor<br/>booking · promo · game]:::p
  S["sobre<br/>{ id, type, topics[], payload, at }<br/><i>sin seq</i>"]:::e
  R[realtime]:::r
  L["RtEvent<br/>{ seq, id, type, topics[], payload, at }"]:::e
  C1[conexiones suscritas<br/>a alguno de los topics]:::c

  P -->|PUBLISH planazo.events| S
  S --> R
  R -->|"INSERT → seq"| L
  L -->|EVENT| C1
```

| Campo | Quién lo pone | Para qué |
|---|---|---|
| `id` | el productor (UUID v4) | descartar duplicados en `realtime` y en el cliente |
| `type` | el productor | `PLACE.UPDATE`, `PROMO.PUSH`, `SNAKE.SCORE`… |
| `topics[]` | el productor | a quién va: `zone:zona-g`, `place:p7`, `user:u1`, `room:A7X9` |
| `payload` | el productor | el contenido, **plano**, con la forma de `types.ts` (`PROMO.PUSH` → `Promo`, `RESERVE.OK` → `Reservation`, `INV.UPDATE` → `{ placeId, slot }`) |
| `at` | el productor (epoch ms) | cuándo pasó |
| `seq` | **solo `realtime`** al persistir | orden global y punto de reanudación |

Esquema formal: `planazo-infra/contracts/events.schema.json`.

---

## 6 · Modelo de datos por servicio

Cada servicio tiene su propia base. No hay llaves foráneas entre servicios: las referencias cruzadas (`placeId`, `userId`) son identificadores de texto que solo el dueño valida.

```mermaid
erDiagram
  %% booking
  ESTABLISHMENTS ||--o{ TIME_SLOTS : tiene
  ESTABLISHMENTS ||--o{ EVENTS_NEGOCIO : publica
  TIME_SLOTS ||--o{ RESERVATIONS : recibe
  ESTABLISHMENTS {
    text id PK "p1..p12"
    text name
    text category
    text zone "zona-g | zona-t"
    float lat
    float lng
    text description
    int price_level
    text owner_user_id "b1 | b2 | b3 | null"
  }
  TIME_SLOTS {
    text id PK
    text establishment_id FK
    timestamptz starts_at
    int capacity
    int taken
    int version "CC-3"
  }
  RESERVATIONS {
    text id PK
    text slot_id FK
    text user_id "u1..u6"
    text user_name
    int people
    text code
    text status
    timestamptz created_at
  }
  EVENTS_NEGOCIO {
    text id PK
    text establishment_id FK
    text title
    timestamptz starts_at
    int capacity
    int taken
  }
```

```mermaid
erDiagram
  %% promo (PostgreSQL) + Redis
  PROMOS ||--o{ COUPONS : emite
  PROMOS {
    text id PK
    text place_id "referencia, sin FK"
    text place_name "copia de lectura"
    text zone
    text title
    text discount
    int initial_stock
    timestamptz expires_at
  }
  COUPONS {
    text id PK
    text promo_id FK
    text user_id
    text code
    timestamptz claimed_at
    timestamptz redeemed_at "null hasta que se usa"
  }
  REDIS_PROMO {
    string key "promo:{id}:stock"
    int value "DECR atómico, TTL = duración"
  }
```

```mermaid
erDiagram
  %% realtime
  EVENTS {
    bigserial seq PK "orden global"
    uuid id UK "deduplicación"
    text type
    jsonb payload
    text_array topics "zone: place: user: room:"
    timestamptz created_at
  }
```

`game` no tiene PostgreSQL. En memoria: `rooms[code] = { hostId, status, players[], snakes, food, tick, endsAt }`. En Redis: `leaderboard:{code}` y `hall-of-fame` como sorted sets.

---

## 7 · Repositorios y flujo de trabajo

```mermaid
flowchart LR
  classDef repo fill:#e8eef8,stroke:#1f4b99,color:#0f2f66
  classDef meta fill:#f4f6fa,stroke:#5b7db1,color:#0f2f66,stroke-dasharray: 4 3

  subgraph org["planazo-team"]
    G[.github<br/>plantillas de PR e issues<br/>portada]:::meta
    T[planazo-service-template<br/>NestJS + health + bus + Dockerfile + CI]:::meta
    I[planazo-infra<br/>docker compose · k6 · contratos · bruno]:::meta
    F[planazo-frontend<br/>+ docs/ del proyecto]:::repo
    A[planazo-api-gateway]:::repo
    B[planazo-booking]:::repo
    P[planazo-promo]:::repo
    M[planazo-game]:::repo
    R[planazo-realtime]:::repo
  end

  T -.->|apply-template.sh| B & M & R
  F -->|types.ts es el contrato| I
  I -->|compose construye| A & B & P & M & R
  I -.->|k6 prueba| A
```

Cada repo: `main` protegida, PR con 1 aprobación y check `ci` verde, squash merge, CODEOWNERS pide revisión al dueño, Dependabot semanal. Detalle en [`plan-organizacion.md`](plan-organizacion.md).
