# Planazo

Plataforma para descubrir restaurantes, discotecas, hoteles y eventos en un **mapa en tiempo real**, con un **agente inteligente** que arma la ruta del plan y la reserva.

Piloto en **Zona G y Zona T** — Chapinero, Bogotá · MVP de **8 semanas**.

---

## Estado del repositorio

| Parte | Estado |
|---|---|
| `frontend/prototipo/` | ✅ **Existe.** Prototipo navegable desplegado en Netlify |
| `docs/` | ✅ **Existe.** Arquitectura propuesta y diagrama |
| `services/*` | 🔲 Por construir — ver [arquitectura](#arquitectura) |
| `frontend/mobile`, `frontend/panel` | 🔲 Por construir |

> ⚠️ **El prototipo no es código de producción.** Es un sitio estático que simula en JavaScript las carreras de concurrencia, el consumo de cupos y el multijugador, sin backend. Sirve para validar el flujo y explicar los retos; la implementación real vive en `services/`.

---

## Los seis retos

| | Reto | Mecanismo | Servicio |
|---|---|---|---|
| **RT‑1** | Mapa en tiempo real | Suscripción por zona geográfica | `realtime` + `booking` |
| **RT‑2** | Promociones y eventos en vivo | Event log con secuencia global + idempotencia | `realtime` |
| **RT‑3** | Leaderboard del Snake | Salas + servidor autoritativo a 20 Hz | `game` |
| **CC‑1** | Promociones limitadas | Decremento atómico en Redis | `promo` |
| **CC‑2** | Leaderboard concurrente | Escritura atómica sobre sorted set | `game` |
| **CC‑3** | Cupos limitados | Lock optimista con versionado | `booking` |

---

## Arquitectura

**Cinco microservicios más un gateway de entrada.** Diagrama completo: [`docs/arquitectura.html`](docs/arquitectura.html) · especificación detallada: [`docs/arquitectura.md`](docs/arquitectura.md).

### El criterio de corte

No se divide por entidad ("servicio de usuarios", "servicio de eventos"). Se divide por **frontera de consistencia** y **perfil de ejecución**:

- Lo que comparte una **transacción** no se separa — o aparece una transacción distribuida sin necesidad.
- Lo que tiene un **perfil de carga distinto** sí se separa — o se estorban dentro del mismo proceso.

### Los servicios

| # | Servicio | Responsabilidad | Datos | Retos | ¿Recortable? |
|---|---|---|---|---|---|
| 1 | **`booking`** | Franjas, cupos, reservas, eventos del negocio | PostgreSQL | CC‑3 · RT‑1 | ❌ |
| 2 | **`promo`** | Promociones de stock finito y cupones | Redis + PostgreSQL | CC‑1 | ❌ |
| 3 | **`game`** | Salas, partida de Snake, marcador | Memoria + Redis | RT‑3 · CC‑2 | ❌ |
| 4 | **`realtime`** | WebSocket, suscripciones y event log | PostgreSQL | RT‑2 · RT‑1 | ❌ |
| 5 | **`agent`** | Convierte una frase en una ruta de lugares | Sin estado | — | ✅ |
| — | *`api-gateway`* | Entrada HTTP, validación del token, enrutamiento | Sin estado | — | infraestructura |

**Cuatro son intocables:** cada uno carga al menos un reto obligatorio. **`agent` puede empezar como módulo del gateway** —es sin estado y no implementa ningún reto— y extraerse después si sobra tiempo. Extraer un módulo sin estado es medio día; fusionar dos servicios ya desplegados, no.

### Por qué cada corte

- **`booking` guarda reserva e inventario juntos.** Una reserva escribe en la misma fila que el inventario. Separarlos convierte un `UPDATE … WHERE version = $1` en un problema distribuido.
- **`promo` va aparte de `booking`** aunque ambos manejen recursos escasos. Su mecanismo es otro —contador atómico, no versionado— y su pico de tráfico, mil usuarios reclamando a la vez, **no puede tumbar las reservas**.
- **`game` corre un bucle a 20 Hz.** Compartir proceso con un servidor HTTP mata de hambre a uno de los dos. Además su estado es efímero: si se reinicia, el negocio no se entera.
- **`realtime` es el único con conexiones vivas.** Escala por conexiones concurrentes, no por peticiones. Centralizar ahí el event log hace que la reconexión se implemente **una sola vez** y todos los servicios la hereden.
- **`agent` depende de un tercero** lento, que puede fallar y que cobra por llamada. Aislado, una ráfaga de consultas al modelo no degrada el mapa.

### Qué NO se separa

- ❌ Reservas aparte del inventario — misma transacción
- ❌ Eventos aparte de establecimientos — mismo agregado
- ❌ Leaderboard aparte del juego — CC‑2 es la escritura del propio juego
- ❌ Servicio de notificaciones — `realtime` ya difunde
- ❌ Servicio de usuarios — no hay historias de autenticación en el MVP

### Comunicación

```
cliente ──WebSocket──> realtime ◄─────────────────┐
                                                   │ consume
cliente ──HTTP──> api-gateway ──> booking ──┐      │
                              ├──> promo ───┼──> bus de eventos (Redis pub/sub)
                              ├──> game ────┘
                              └──> agent ──(lectura)──> booking
```

- **Síncrono:** HTTP desde el gateway hacia cada servicio.
- **Asíncrono:** cada servicio publica sus eventos de dominio al bus; `realtime` los persiste con `seq` y los difunde solo a quien está suscrito a esa zona o esa sala.

**Regla inviolable:** ningún servicio escribe en la base de datos de otro, y ningún servicio le dice a otro qué hacer — solo publica lo que le pasó.

---

## Qué se construye de verdad y qué no

El tiempo del MVP se concentra en lo que **no se puede simular**: los dos clicks que compiten por un recurso escaso y el juego en vivo.

### Sin atajos

- **`game`** — el bucle, las colisiones y el marcador concurrente.
- **`promo`** — el click que compite por un cupón de stock 1.
- **`booking`** — el click que compite por el último cupo.
- **`realtime`** — difusión segmentada y recuperación tras desconexión.

> Son **dos clicks sobre recursos de forma distinta**, y por eso se resuelven distinto. El cupón es un contador simple: decremento atómico. El cupo es un recurso compuesto —franja, cantidad variable, hold mientras el usuario confirma— y necesita versionado para detectar que alguien lo modificó mientras decidía.

### Desde datos semilla

| Qué | Cómo |
|---|---|
| Autenticación y roles | 6 usuarios y 3 establecimientos con JWT fijo firmado al arrancar. Sin registro ni recuperación de contraseña |
| Catálogo | Establecimientos, fotos y eventos de Zona G y Zona T cargados por script |
| `agent` | Puede caer a plantillas sobre el catálogo semilla si el cronograma aprieta |

### Fuera del MVP

Pauta, métricas del negocio, notificaciones push fuera de la app, reseñas, billetera de créditos.

---

## Stack

| Capa | Herramienta |
|---|---|
| App móvil | React Native + Expo |
| Panel del negocio | Next.js |
| Servicios | NestJS (Node + TypeScript) |
| Tiempo real | Socket.IO |
| Base de datos | PostgreSQL |
| Concurrencia y bus | Redis — stock atómico, sorted set y pub/sub |
| Agente | Claude API con salida estructurada |
| Pruebas de carga | k6 |
| Gestión | Azure DevOps |

---

## Estructura objetivo

```
planazo/
├── frontend/
│   ├── prototipo/        ✅ prototipo navegable (Netlify)
│   ├── mobile/           🔲 React Native + Expo
│   └── panel/            🔲 Next.js
├── services/
│   ├── api-gateway/      🔲
│   ├── booking/          🔲
│   ├── promo/            🔲
│   ├── game/             🔲
│   ├── realtime/         🔲
│   └── agent/            🔲  (empieza como módulo del gateway)
├── docs/                 ✅ arquitectura y diagrama
└── docker-compose.yml    🔲 levanta todo con un solo comando
```

Un solo repositorio y un `docker-compose up`. Sin CI/CD independiente por servicio ni repos separados: es lo que encarece los microservicios y no aporta nada al MVP.

---

## Reparto sugerido

| Persona | Frente | Nota |
|---|---|---|
| 1 | `game` | 9 de las 25 historias del MVP están aquí |
| 2 | `realtime` + event log | **Arranca primero:** los demás dependen de él para difundir |
| 3 | `booking` + `promo` | El mismo patrón mental con dos mecanismos distintos |
| 4 | `frontend` + `agent` + seed | Clientes, datos semilla y el agente al final |

`realtime` debería tener el canal funcionando en la **semana 2**, porque `game`, `promo` y `booking` lo necesitan para difundir.

---

## Correr el prototipo

Es estático: no requiere build ni dependencias.

```bash
cd frontend/prototipo
npx serve .
```

O arrastrando la carpeta `frontend/prototipo` a [app.netlify.com/drop](https://app.netlify.com/drop). Instrucciones de despliegue en [`frontend/prototipo/README.md`](frontend/prototipo/README.md).

| Página | Contenido |
|---|---|
| `index.html` | Portada con enlaces a todo |
| `prototipo.html` | App del cliente y panel del establecimiento |
| `story-map.html` | Story mapping con MoSCoW y los hilos de recorrido |
| `caso-negocio.html` | Caso de negocio con investigación de mercado |
| `brief.html` | Brief técnico del proyecto |
