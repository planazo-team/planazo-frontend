# Planazo — modelo de seguridad del MVP

Qué protegemos, contra qué, y con qué. Es un MVP académico sin datos sensibles reales, así que el criterio es: **cerrar lo que es barato de cerrar y explicar lo que se deja abierto a propósito.**

- Diagramas de despliegue: [`diagramas.md`](diagramas.md) §3 · Reglas de la organización: [`plan-organizacion.md`](plan-organizacion.md) §2

---

## 1 · Qué hay que proteger

| Activo | Por qué importa |
|---|---|
| **La integridad de los retos** (cero sobreventas, sin duplicados, marcador correcto) | Es lo evaluable. Si alguien puede saltarse el gateway e inventarse `x-user-id`, puede reservar por otro o reclamar cupones por otro y el reto deja de demostrar nada. |
| **Los secretos** (`JWT_SECRET`, `GATEWAY_KEY`, `ANTHROPIC_API_KEY`) | Con `JWT_SECRET` cualquiera firma tokens de cualquier usuario. Con la llave de Anthropic, alguien gasta el crédito del equipo. |
| **La rama `main` de cada repo** | Es lo que se despliega. Un push accidental o un merge sin revisar tumba la demo. |
| **La disponibilidad** de los servicios con recurso finito | Un pico artificial contra `promo` no puede tumbar `booking`. Ya está resuelto por la separación de servicios. |

---

## 2 · Controles en la aplicación

### 2.1 · Identidad: JWT firmado solo por el gateway

- `POST /api/auth/demo { userId }` firma un JWT HS256 con `sub`, `name`, `role`, `placeId`, vence a **7 días**.
- No hay contraseña: es login de demostración. Cualquiera puede ser `u1`. **Está bien y es deliberado** (ver §5).
- El gateway verifica el token en cada petición; los servicios HTTP **no** vuelven a verificar. Lo que verifican es la llave del gateway (§2.2).
- `realtime` verifica el JWT por su cuenta porque su WebSocket no pasa por el gateway: el token viaja en el **primer mensaje** del socket (`AUTH`), nunca en la URL, para que no quede en logs de proxies ni en el historial.
- `game` (Java) verifica el JWT en todo: en REST recibe el `Authorization: Bearer` que el gateway le reenvía, y en STOMP lo lee del header `Authorization` del frame `CONNECT` (un `CONNECT` sin token válido se rechaza). Usa el mismo secreto bajo el nombre `JWT_SECRETO` y lee los claims `sub` y `nombre`.

### 2.2 · Confianza entre gateway y servicios: `x-gateway-key`

Los servicios confían en `x-user-id`, `x-user-name`, `x-user-role` y `x-user-place-id`. Si un servicio fuera alcanzable desde internet, cualquiera podría poner esos headers a mano. Dos capas lo impiden:

1. **Red privada.** En Railway, `booking` y `promo` no tienen dominio público; solo el gateway los alcanza por `*.railway.internal`. `game` sí tiene dominio público (por el WebSocket) y **no usa `x-gateway-key`**: su barrera es el JWT del punto 2.1, que valida en cada petición.
2. **Llave compartida.** El gateway agrega `x-gateway-key: <GATEWAY_KEY>` a todo lo que reenvía. Cada servicio rechaza con `401 GATEWAY_KEY_INVALIDA` cualquier petición HTTP sin la llave correcta, salvo `GET /health`. Si `GATEWAY_KEY` no está definida (desarrollo local), el guard deja pasar y lo dice en el log.

El gateway **sobrescribe** los headers `x-user-*` con los datos del token: lo que mande el cliente con ese nombre se descarta. Está en `src/proxy/forward.ts`.

### 2.3 · Navegador: CORS, rate limit, helmet

- **CORS con lista blanca.** `ALLOWED_ORIGINS` (separados por coma). En local `http://localhost:3000`; en producción la URL de Vercel. Un origen que no está en la lista no recibe `Access-Control-Allow-Origin` y el navegador bloquea la respuesta.
- **Rate limit** por IP: 100 peticiones por minuto por defecto (`RATE_LIMIT_PER_MINUTE`); en producción está en 600 para que una demo con varios navegadores detrás de la misma IP no se corte. Responde `429 { code: RATE_LIMIT }`. Los k6 de carga se corren **directo contra los servicios** en local, o con un límite alto en un entorno de pruebas, no contra el gateway de producción.
- **helmet** pone los headers de seguridad estándar (`X-Content-Type-Options`, `X-Frame-Options`, etc.).

### 2.4 · Servicios: no arrancar mal configurados

- Con `NODE_ENV=production`, el gateway **se niega a arrancar** si `JWT_SECRET` o `GATEWAY_KEY` faltan o tienen menos de 16 caracteres. Mejor caerse en el deploy que firmar tokens con `dev-secret`.
- Cada servicio corre como usuario `node` (no root) dentro de su imagen.
- El gateway tiene timeout de 10 s hacia los servicios (`UPSTREAM_TIMEOUT_MS`): un servicio colgado responde `502`, no bloquea al gateway.

### 2.5 · WebSockets

| Regla | `realtime` | `game` |
|---|---|---|
| Token en el primer mensaje (`AUTH`) | ✅ | ✅ (header `Authorization` del frame STOMP `CONNECT`) |
| Cerrar la conexión si no llega `AUTH` válido en 5 s | ✅ | ✅ (rechaza el `CONNECT`) |
| Solo suscribirse a `user:<id>` del propio token | ✅ | — |
| Solo enviar intenciones, nunca posiciones | — | ✅ (el servidor es la autoridad) |
| Límite de mensajes por segundo por conexión | recomendado | recomendado (20/s basta para 20 Hz) |

### 2.6 · Errores que no filtran nada

Todas las respuestas de error son `{ code, message }` con un mensaje para el usuario. Nunca un stack trace, nunca el SQL, nunca la URL interna del servicio.

---

## 3 · Controles en la infraestructura

| Control | Dónde | Estado |
|---|---|---|
| Secretos iguales en cada servicio de Railway (`JWT_SECRET` = `JWT_SECRETO` de game, `GATEWAY_KEY`, `BUS_URL`) | Railway | ✅ configurados el 8 oct como variables por servicio (no como variables compartidas del proyecto) |
| `booking` y `promo` sin dominio público | Railway | ✅ |
| `.env` en `.gitignore` de todos los repos; solo `.env.example` se sube | todos los repos | ✅ |
| Generar secretos con `openssl rand -hex 32`, nunca a mano | `planazo-infra/.env.example` | ✅ documentado |
| `ANTHROPIC_API_KEY` solo en el gateway; los demás no la necesitan | Railway | ✅ por diseño |
| Bases **separadas por servicio**: ningún servicio tiene credenciales de la base de otro | compose y Railway | ⚠️ en Railway hay **un solo Postgres** que comparten `realtime` (esquema `public`) y `game` (esquema `minijuego`) con el mismo usuario; `booking` y `promo` aún no tienen base. Un Redis para todos. |

---

## 4 · Controles en GitHub

| Control | Qué evita | Estado |
|---|---|---|
| Permiso base de la organización en `write` (no `admin`) | borrar repos o cambiar visibilidad por accidente | ⚠️ requiere owner desde la web |
| Cada dueño `admin` solo en su repo | ídem | ✅ |
| **Protección de `main`**: PR obligatorio, check `ci` verde, sin force push, sin borrar | push directo, código que no compila | ✅ en `planazo-frontend` (desde el 8 oct **sin aprobación obligatoria**: con un solo revisor disponible bloqueaba la integración) y en `.github` (con 1 aprobación) · ⚠️ **no disponible en los 7 repos privados con el plan gratuito** |
| Solo **squash merge**, borrar rama al merge | historial ilegible, ramas huérfanas | ✅ en los 9 |
| **CODEOWNERS** en cada repo | que un cambio al servicio de alguien se apruebe sin que se entere | ✅ (solo se hace cumplir donde hay protección de rama) |
| **Dependabot** alertas y actualizaciones de seguridad | dependencias con CVE conocidas | ✅ en los 9. Agrupa parches y menores en un PR semanal y no propone saltos mayores (esos se hacen a mano y probados). `npm audit --omit=dev` en 0 en gateway, plantilla, booking, game, realtime y frontend tras subir a NestJS 11.2.6 y Next 16.3.7 (PRs del 29 sep) |
| **Secret scanning + push protection** | subir una llave por accidente | ✅ por defecto para repos nuevos públicos; en privados requiere plan de pago |
| 2FA obligatorio en la organización | cuentas robadas | ⚠️ requiere owner desde la web |
| CI construye la imagen Docker | que `main` no sea desplegable | ✅ |

---

## 5 · Lo que se deja abierto a propósito

| Riesgo | Por qué se acepta en el MVP | Qué haría falta después |
|---|---|---|
| Cualquiera puede iniciar sesión como cualquier usuario semilla | No hay historias de autenticación; los 9 usuarios son de demostración y no representan personas reales | Servicio de identidad con contraseña o proveedor externo (Google), y `POST /auth/demo` desactivado en producción |
| El token dura 7 días y no se puede revocar | No hay sesiones reales que proteger | Tokens cortos con refresh, o lista de revocación en Redis |
| No hay auditoría de quién cambió qué cupo | El event log de `realtime` ya registra los `INV.UPDATE` con `userId`; sirve como auditoría mínima | Tabla de auditoría en `booking` |
| El WebSocket del juego acepta cualquier frecuencia de `INTENT` | Un cliente que manda 1000 intenciones por segundo solo se hace daño a sí mismo: el servidor aplica una por tick | Límite por conexión si se ve abuso |
| Un solo Redis para bus y contadores | Un Redis gestionado aguanta de sobra el tráfico de la demo | Redis separado para el bus |
| Sin TLS entre gateway y servicios | Viajan por la red privada de Railway | mTLS si algún día salen de la misma red |
| `game` acepta cualquier origen en CORS y mantiene `POST /api/v1/auth/dev-token` | Son atajos de desarrollo del servicio de Diego; el `dev-token` firma con el mismo secreto, así que equivale al `/api/auth/demo` del gateway | Restringir CORS al dominio de Vercel y poner el `dev-token` detrás de un perfil `dev` |
| `realtime` persiste cada `GAME.STATE_UPDATE` (20 por segundo por sala) | Funciona para la demo | Difundir sin persistir los eventos del juego, o purgar la tabla |

---

## 6 · Qué hacer si se filtra un secreto

1. **Rotar** el secreto en Railway (variables compartidas) y redesplegar. Con `JWT_SECRET` nuevo, todos los tokens anteriores dejan de valer: los usuarios vuelven a entrar desde `/`.
2. Si fue la llave de Anthropic: revocarla en la consola de Anthropic y crear otra.
3. Si quedó en un commit: **no basta con borrarlo en otro commit.** Hay que reescribir el historial (`git filter-repo`) y forzar el push, o dar el secreto por quemado y rotarlo. Rotar es más rápido y más seguro.
4. Abrir un issue con la etiqueta `bug` describiendo qué se filtró y qué se rotó, sin pegar el secreto.

---

## 7 · Tácticas de seguridad arquitectónica (Bass, Clements & Kazman)

En el marco de la arquitectura de software de Bass, Clements & Kazman, las tácticas de seguridad de Planazo se estructuran en tres familias primarias:

### 7.1 · Detectar ataques (Detect Attacks)
* **Detección de patrones y ráfagas anómalas (ESC-03):** El API Gateway implementa un contador de errores (HTTP 401 y 429) por dirección IP utilizando una ventana deslizante de 1 minuto en Redis (`ip:err4xx:<ip>`). Si una IP acumula más de 50 fallos en ese lapso (indicativo de escaneo o fuerza bruta), se activa la detección de ataque.
* **Emisión de alertas de seguridad:** Ante la superación del umbral, el gateway emite de forma síncrona un evento estructurado `[ALERTA_SEGURIDAD]` para ser consumido por el recolector de métricas/logs y reflejado en el tablero técnico en menos de 60 segundos.
* **Bitácora de auditoría forense (`audit_log`):** Registro append-only de todas las operaciones sensibles del negocio con IP de origen, sujeto de identidad (`userId`), acción ejecutada, fecha y correlation-id (`x-correlation-id`).

### 7.2 · Resistir ataques (Resist Attacks)
* **Autenticar actores (ESC-01):**
  - **Identidad federada y delegada (Firebase Auth + Google):** Login mediante Firebase Authentication (`planazo-auth`) y Google OpenID Connect (`POST /api/auth/google`). El API Gateway valida la firma criptográfica con las llaves públicas de Google y de Firebase SecureToken, el emisor, audiencia y expiración, y firma el JWT oficial de Planazo (`JWT_SECRET`).
  - **Autenticación multifactor (2FA / TOTP) y reautenticación en modo negocio:** Activar el modo negocio exige verificar el NIT con dígito de verificación DIAN y una credencial reciente (< 10 min); además, el panel del negocio cuenta con verificación en dos pasos mediante código TOTP de 6 dígitos (`POST /api/auth/2fa/*`).
* **Autorizar actores (ESC-02):**
  - **Control de acceso stateless por rol (`cliente` | `negocio`) y por establecimiento (`placeId`):** Todo acceso a endpoints protegidos exige un JWT válido firmado por el API Gateway (ADR-05). El gateway valida en `role-auth.ts` que `cliente` solo pueda reservar, reclamar cupones y jugar, y que `negocio` solo pueda editar cupos, ver reservas de su lugar, crear eventos y lanzar promociones sobre su propio `placeId` (enviando `x-user-place-id` únicamente cuando `role === 'negocio'`).
  - **Verificación de sujeto en dominio:** El microservicio Minijuego (Spring Security OAuth2 Resource Server) y su interceptor WebSocket STOMP (`StompAuthChannelInterceptor`) rechazan cualquier frame `CONNECT` o petición REST donde el identificador objetivo no coincida con el sujeto del token (`jugadorId == jwt.sub`), respondiendo con `403 Forbidden` sin invocar la capa de negocio.
* **Resistir ataques de fuerza bruta y DoS:**
  - **Bloqueo temporal de IP en Redis:** Bloqueo automático durante 10 minutos (`ip:blocked:<ip>` con TTL 600 s) para cualquier IP detectada como agresora, respondiendo con `429 Too Many Requests` (`IP_BLOQUEADA`) directamente en el middleware perimetral.
  - **Rate Limiting:** Límite preventivo de 600 req/min por IP en producción configurado mediante `express-rate-limit`.
* **Confianza perimetral e integridad de mensajes:**
  - Validación de header secreto `x-gateway-key` en servicios internos para evitar que peticiones que eludan el gateway puedan inyectar headers de identidad.
  - Sanitización estricta de headers en el gateway: cualquier header `x-user-*` enviado por el cliente es sobrescrito por los datos legítimos del JWT.

### 7.3 · Reaccionar y recuperarse de ataques (React & Recover)
* **Trazabilidad de incidentes:** Cada petición externa recibe un `x-correlation-id` (UUID v4) que se propaga por HTTP hacia los microservicios aguas abajo y se estampa en los eventos publicados en Redis y en cada línea de la bitácora de auditoría. Permite aislar y rastrear cualquier vector de ataque de punta a punta.
* **Inmutabilidad y protección de auditoría:** La tabla `audit_log` tiene revocado cualquier privilegio de `UPDATE` o `DELETE` para el usuario de la aplicación, garantizando que un compromiso a nivel de aplicación no pueda borrar la evidencia histórica.
* **Procedimiento de rotación rápida de secretos:** Procedimiento documentado (§6) para rotar `JWT_SECRET` y revocar instantáneamente todas las sesiones activas en caso de compromiso.

