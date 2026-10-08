# Planazo — estado de la aplicación

Foto del sistema al **8 de octubre de 2026** (semana 3 del MVP de 8 semanas). Se actualiza con cada hito; el detalle de cada pieza está en [`contexto.md`](contexto.md) y en el README de cada repo.

## Resumen

Los cinco servicios y el frontend están en producción y probados de punta a punta. Los seis retos tienen su mecanismo desplegado. Faltan la persistencia en PostgreSQL de booking y promo, las pruebas de carga contra Railway y algunos cierres de producción en game y realtime.

## Producción

| Pieza | Dónde | URL | Estado |
|---|---|---|---|
| frontend | Vercel (proyecto `planazo-frontend`, Root Directory `frontend`) | https://planazo-frontend.vercel.app | `live` contra los cinco servicios. Variables: `NEXT_PUBLIC_API_MODE`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_REALTIME_URL`, `NEXT_PUBLIC_GAME_URL`. Cada push a `main` despliega. |
| api-gateway | Railway, dominio público | https://planazo-api-gateway-production.up.railway.app | Auth demo, proxy a booking/promo con `x-gateway-key`, proxy a game con `Bearer`, CORS, rate limit 600/min, agente con plantilla (sin `ANTHROPIC_API_KEY`). |
| booking | Railway, red privada | `http://planazo-booking.railway.internal:3001` | CC-3 con lock optimista. **Estado en memoria**: un redespliegue borra las reservas. |
| promo | Railway, red privada | `http://planazo-promo.railway.internal:3002` | CC-1 con `DECR` atómico en Redis (Lua). Promociones y cupones **en memoria**; stock en Redis. |
| realtime | Railway, dominio público | `wss://planazo-realtime-production.up.railway.app/ws` | AUTH, SUBSCRIBE, RESUME, REPLAY. Event log en Postgres (esquema `public`, Prisma). Persiste también los ticks del juego. |
| game | Railway, dominio público | `https://planazo-game-production.up.railway.app` (REST `/api/v1`, STOMP `/ws`, Swagger `/swagger-ui.html`) | Java 21 + Spring Boot. Salas fijas, tick a 20 Hz, leaderboard en Redis, resultados en Postgres (esquema `minijuego`). |
| Postgres | Railway | privado | Uno solo, compartido por realtime y game. |
| Redis | Railway | privado | Uno solo: bus `planazo.events`, stock de promo, leaderboard de game (db 1). |

Proyecto de Railway: `zesty-freedom` (workspace de Camilo, plan Hobby). Secretos `JWT_SECRET` (= `JWT_SECRETO` en game) y `GATEWAY_KEY` iguales en cada servicio, generados el 8 de octubre; quien los necesite los copia desde las variables de Railway, nunca por chat.

## Lo que se verificó en producción (8 de octubre)

- Login demo, mapa con los 12 lugares, ficha con promociones reales, reserva confirmada y `409 VERSION_CONFLICT` al repetirla con la versión vieja.
- Promoción lanzada por `b1`, 10 reclamos simultáneos contra stock 3: exactamente 3 cupones y 7 `PROMO_AGOTADA`.
- Un cliente WebSocket suscrito a `zone:zona-t` recibe el `PROMO.PUSH` con su `seq`.
- Partida de cuatro jugadores en `Sala Cartagena` desde la web pública: cuenta regresiva, movimiento en vivo y marcador global.

## Repos y ramas

| Repo | `main` | Protección |
|---|---|---|
| planazo-frontend | live + rediseño (#12), juego de Diego (#17), docs (#18) | PR + check `ci`; sin aprobación obligatoria desde el 8 oct |
| planazo-api-gateway | NestJS 11, JWT compartido con game (#12), docs (#14) | sin protección (privado) |
| planazo-booking | implementado (#13), docs (#14) | sin protección (privado) |
| planazo-promo | reescrito al contrato (#14), docs (#17) | sin protección (privado) |
| planazo-game | Java, bus Redis, docs (#12) | sin protección (privado) |
| planazo-realtime | protocolo completo, docs (#15) | sin protección (privado); CI en rojo por lint |
| planazo-infra | script de Railway (#4), docs (#5) | sin protección (privado) |
| planazo-service-template | NestJS 11 (#8), docs (#11) | sin protección (privado) |
| .github | docs PR #1 **abierto**: exige una aprobación | PR + 1 aprobación |

## Pendientes, por prioridad

1. **PostgreSQL en booking y promo.** Hoy todo vive en memoria; cada redespliegue reinicia reservas y cupones. Fabián.
2. **k6 contra Railway**: CC-1, CC-3 y RT-2 ya existen en `planazo-infra/k6`; CC-2 hay que reescribirlo al protocolo STOMP de game. Juan Diego y Diego.
3. **Volumen en realtime**: game publica `GAME.STATE_UPDATE` 20 veces por segundo por sala y realtime lo persiste. Decidir si se difunde sin guardar. Camilo y Diego.
4. **Cierres de producción en game**: restringir CORS y apagar `POST /api/v1/auth/dev-token`. Diego.
5. **Lint de realtime** (cuatro variables sin usar) para que el CI vuelva a verde. Camilo.
6. **`ANTHROPIC_API_KEY`** en el gateway para que el agente deje de responder plantilla. Juan Diego.
7. Mergear el PR #1 de `.github` (necesita una aprobación) y cerrar los PRs de Dependabot obsoletos en `planazo-game`.

## Cómo retomar

- Correr todo en local: `planazo-infra/README.md`. Desplegar o reconfigurar gateway, booking y promo: `planazo-infra/scripts/railway-deploy-core.sh`. Realtime y game se despliegan desde GitHub con `railway service source connect`.
- Documentación: empieza por [`contexto.md`](contexto.md); el contrato ejecutable es `frontend/src/lib/types.ts`, `api/types.ts` y `game/types.ts`; la tabla está en `planazo-infra/contracts/`.
