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
    PR["promo<br/>NestJS · :3002<br/>CC-1"]:::svc
    GM["game<br/>Java · Spring Boot · :8082<br/>REST /api/v1 + STOMP /ws<br/>RT-3 · CC-2"]:::svc
    RT["realtime<br/>NestJS · ws :8081<br/>RT-2 · RT-1"]:::svc
  end

  subgraph Datos
    PG[(PostgreSQL<br/>realtime: event log · game: esquema minijuego)]:::db
    RD[(Redis<br/>bus · stock de promo · leaderboard de game)]:::db
    MEM["memoria<br/>booking: inventario y reservas · promo: promos y cupones"]:::db
  end

  BUS{{"bus de eventos<br/>Redis pub/sub · canal planazo.events"}}:::bus

  FE -->|"HTTP /api/*"| GW
  FE -.->|ws AUTH · SUBSCRIBE · RESUME| RT
  FE -.->|STOMP CONNECT con JWT · registrar-sesion · mover| GM

  GW -->|"/places /reservations /events<br/>x-user-* + x-gateway-key"| BK
  GW -->|"/promos"| PR
  GW -->|"/api/v1/salas /leaderboard /historico<br/>Authorization: Bearer"| GM
  AG -->|GET /places lectura| BK

  BK --- MEM
  PR --- MEM
  PR --- RD
  GM --- RD
  GM --- PG
  RT --- PG

  BK ==>|PLACE.UPDATE INV.UPDATE RESERVE.OK| BUS
  PR ==>|PROMO.PUSH PROMO.WON PROMO.EXPIRED| BUS
  GM ==>|LOBBY.ROOMS_UPDATE GAME.STATE_UPDATE GAME.PARTIDA_FINALIZADA| BUS
  BUS ==>|consume todo y asigna seq| RT
```

Lectura rápida:

- **Dos puertas de entrada**, no una: HTTP por el gateway; WebSocket directo a `realtime` y `game`. Hacia `game` el socket solo lleva comandos; el estado de cada tick vuelve por el bus y `realtime`, que es quien lo reparte a los jugadores.
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

  subgraph Railway["Railway · un proyecto · JWT_SECRET (= JWT_SECRETO en game), GATEWAY_KEY y BUS_URL iguales en cada servicio"]
    direction TB
    subgraph Publico["Con dominio público"]
      GW[api-gateway<br/>planazo-api-gateway-production.up.railway.app]:::pub
      RT[realtime · 1 réplica<br/>planazo-realtime-production.up.railway.app]:::pub
      GM[game · 1 réplica<br/>planazo-game-production.up.railway.app<br/>REST y STOMP en el mismo puerto 8082]:::pub
    end
    subgraph Privado["Solo red privada *.railway.internal"]
      BK[booking]:::priv
      PR[promo]:::priv
    end
    PG[(Postgres<br/>realtime: public · game: minijuego)]:::db
    RD[(Redis)]:::db
  end

  U -->|https| FE
  U -->|"https /api"| GW
  U -.->|"wss /ws"| RT
  U -.->|"wss /ws/websocket (STOMP)"| GM
  GW -->|http privado :3001| BK
  GW -->|http privado :3002| PR
  GW -->|http privado :8082 + Bearer| GM
  PR --- RD
  GM --- RD
  GM --- PG
  RT --- PG
  BK & PR & GM -->|publish| RD
  RD -->|subscribe| RT
```

Decisiones:

- `booking` y `promo` **no tienen dominio público**: solo el gateway los alcanza por la red privada de Railway. Aunque alguien conociera su URL, sin `x-gateway-key` responden `401`.
- `game` necesita dominio público por el WebSocket. Su REST **no usa `x-gateway-key`**: exige un `Authorization: Bearer` válido, que es el que el gateway reenvía. Sin un token del gateway no responde.
- `realtime` y `game` con **una réplica**: tienen estado en memoria (suscripciones, salas).
- `JWT_SECRET` y `GATEWAY_KEY` se generaron una vez con `openssl` y están como variables de cada servicio (las pone `planazo-infra/scripts/railway-deploy-core.sh`; en `game` se llama `JWT_SECRETO`). No viajan por chat.
- `booking` y `promo` no tienen base de datos todavía: su estado vive en memoria y un redespliegue lo reinicia.

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
  participant GM as game (Java)
  participant BUS as bus
  participant RT as realtime
  participant RD as Redis
  participant PG as PostgreSQL

  J1->>RT: ws · AUTH · SUBSCRIBE salas · SUBSCRIBE salas:sala-004
  J1->>GW: POST /api/salas/sala-004/jugadores (Bearer)
  GW->>GM: POST /api/v1/salas/sala-004/jugadores (Bearer reenviado)
  GM->>BUS: LOBBY.ROOMS_UPDATE [salas]
  GM-->>J1: 201 { data: ResumenSala }
  J1->>GM: STOMP CONNECT (Authorization: Bearer) · SEND /app/salas/sala-004/registrar-sesion
  J2->>GW: POST /api/salas/sala-004/jugadores
  GW->>GM: (ídem)
  Note over GM: sala llena → CUENTA_REGRESIVA 3 s → EN_CURSO

  loop cada 50 ms (20 Hz), hilo del SalaRuntime
    J1->>GM: SEND /app/salas/sala-004/mover { direccion ARRIBA }
    J2->>GM: SEND /app/salas/sala-004/mover { direccion IZQUIERDA }
    GM->>GM: drena la cola de movimientos · tick · colisiones · comida
    GM->>BUS: GAME.STATE_UPDATE [salas:sala-004] { jugadores, comida, tiempoRestanteSegundos }
    BUS->>RT: persiste con seq, difunde a salas:sala-004
    RT-->>J1: EVENT GAME.STATE_UPDATE
    RT-->>J2: EVENT GAME.STATE_UPDATE
  end

  GM->>PG: INSERT resultados_partida + puntajes_jugador
  GM->>RD: ZINCRBY leaderboard <puntaje> <jugadorId>
  GM->>BUS: GAME.STATE_UPDATE { estado FINALIZADA, resultado } · GAME.PARTIDA_FINALIZADA [global]
  Note over GM,RD: El marcador se lee del sorted set ya ordenado: mismo orden para todos.
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
| `type` | el productor | `PLACE.UPDATE`, `PROMO.PUSH`, `GAME.STATE_UPDATE`… |
| `topics[]` | el productor | a quién va: `zone:zona-g`, `place:p7`, `user:u1`, `salas`, `salas:sala-004`, `global` |
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

> `booking` y `promo` guardan hoy este modelo en memoria; el diagrama es el objetivo en PostgreSQL. Solo `promo:{id}:stock` ya vive en Redis.

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

`game` (Java) usa el esquema `minijuego` del mismo Postgres de `realtime`, con migraciones Flyway: `salas (id, codigo, capacidad)` como catálogo fijo, `resultados_partida (id, sala_id, sala_codigo, ganador_jugador_id, ganador_jugador_nombre, motivo_victoria, iniciada_en, finalizada_en)` y `puntajes_jugador`. La partida en curso vive en memoria dentro de su `SalaRuntime`; el leaderboard global es un sorted set en Redis (db 1).

---

## 7 · Repositorios y flujo de trabajo

```mermaid
flowchart LR
  classDef repo fill:#e8eef8,stroke:#1f4b99,color:#0f2f66
  classDef meta fill:#f4f6fa,stroke:#5b7db1,color:#0f2f66,stroke-dasharray: 4 3

  subgraph org["planazo-team"]
    G[.github<br/>plantillas de PR e issues<br/>portada]:::meta
    T[planazo-service-template<br/>NestJS + health + bus + Dockerfile + CI<br/>game es Java y no la usa]:::meta
    I[planazo-infra<br/>docker compose · k6 · contratos · bruno]:::meta
    F[planazo-frontend<br/>+ docs/ del proyecto]:::repo
    A[planazo-api-gateway]:::repo
    B[planazo-booking]:::repo
    P[planazo-promo]:::repo
    M[planazo-game]:::repo
    R[planazo-realtime]:::repo
  end

  T -.->|apply-template.sh| B & P & R
  F -->|types.ts es el contrato| I
  I -->|compose construye| A & B & P & M & R
  I -.->|k6 prueba| A
```

Cada repo: entrar a `main` por PR con el check `ci` verde y squash merge; CODEOWNERS pide revisión al dueño; Dependabot semanal. GitHub lo hace cumplir en `planazo-frontend` (PR + `ci`, sin aprobación obligatoria desde el 8 de octubre) y en `.github`; en los privados es convención. Detalle en [`plan-organizacion.md`](plan-organizacion.md).
