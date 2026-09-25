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
- `game` y `realtime` sí verifican el JWT, porque sus WebSockets no pasan por el gateway. Usan el mismo `JWT_SECRET`. El token viaja en el **primer mensaje** del socket, nunca en la URL, para que no quede en logs de proxies ni en el historial.

### 2.2 · Confianza entre gateway y servicios: `x-gateway-key`

Los servicios confían en `x-user-id`, `x-user-name`, `x-user-role` y `x-user-place-id`. Si un servicio fuera alcanzable desde internet, cualquiera podría poner esos headers a mano. Dos capas lo impiden:

1. **Red privada.** En Railway, `booking` y `promo` no tienen dominio público; solo el gateway los alcanza por `*.railway.internal`. `game` sí tiene dominio público (por el WebSocket), así que necesita la capa 2.
2. **Llave compartida.** El gateway agrega `x-gateway-key: <GATEWAY_KEY>` a todo lo que reenvía. Cada servicio rechaza con `401 GATEWAY_KEY_INVALIDA` cualquier petición HTTP sin la llave correcta, salvo `GET /health`. Si `GATEWAY_KEY` no está definida (desarrollo local), el guard deja pasar y lo dice en el log.

El gateway **sobrescribe** los headers `x-user-*` con los datos del token: lo que mande el cliente con ese nombre se descarta. Está en `src/proxy/forward.ts`.

### 2.3 · Navegador: CORS, rate limit, helmet

- **CORS con lista blanca.** `ALLOWED_ORIGINS` (separados por coma). En local `http://localhost:3000`; en producción la URL de Vercel. Un origen que no está en la lista no recibe `Access-Control-Allow-Origin` y el navegador bloquea la respuesta.
- **Rate limit** por IP: 100 peticiones por minuto (`RATE_LIMIT_PER_MINUTE`). Responde `429 { code: RATE_LIMIT }`. Los k6 de carga se corren **directo contra los servicios** en local, o con un límite alto en un entorno de pruebas, no contra el gateway de producción.
- **helmet** pone los headers de seguridad estándar (`X-Content-Type-Options`, `X-Frame-Options`, etc.).

### 2.4 · Servicios: no arrancar mal configurados

- Con `NODE_ENV=production`, el gateway **se niega a arrancar** si `JWT_SECRET` o `GATEWAY_KEY` faltan o tienen menos de 16 caracteres. Mejor caerse en el deploy que firmar tokens con `dev-secret`.
- Cada servicio corre como usuario `node` (no root) dentro de su imagen.
- El gateway tiene timeout de 10 s hacia los servicios (`UPSTREAM_TIMEOUT_MS`): un servicio colgado responde `502`, no bloquea al gateway.

### 2.5 · WebSockets

| Regla | `realtime` | `game` |
|---|---|---|
| Token en el primer mensaje (`AUTH`) | ✅ | ✅ |
| Cerrar la conexión si no llega `AUTH` válido en 5 s | ✅ | ✅ |
| Solo suscribirse a `user:<id>` del propio token | ✅ | — |
| Solo enviar intenciones, nunca posiciones | — | ✅ (el servidor es la autoridad) |
| Límite de mensajes por segundo por conexión | recomendado | recomendado (20/s basta para 20 Hz) |

### 2.6 · Errores que no filtran nada

Todas las respuestas de error son `{ code, message }` con un mensaje para el usuario. Nunca un stack trace, nunca el SQL, nunca la URL interna del servicio.

---

## 3 · Controles en la infraestructura

| Control | Dónde | Estado |
|---|---|---|
| Secretos como **variables compartidas** del proyecto de Railway (`JWT_SECRET`, `GATEWAY_KEY`, `BUS_URL`) | Railway | por configurar al desplegar |
| `booking` y `promo` sin dominio público | Railway | por configurar al desplegar |
| `.env` en `.gitignore` de todos los repos; solo `.env.example` se sube | todos los repos | ✅ |
| Generar secretos con `openssl rand -hex 32`, nunca a mano | `planazo-infra/.env.example` | ✅ documentado |
| `ANTHROPIC_API_KEY` solo en el gateway; los demás no la necesitan | Railway | ✅ por diseño |
| Un Redis y tres Postgres **separados por servicio**: ningún servicio tiene credenciales de la base de otro | compose y Railway | ✅ en compose |

---

## 4 · Controles en GitHub

| Control | Qué evita | Estado |
|---|---|---|
| Permiso base de la organización en `write` (no `admin`) | borrar repos o cambiar visibilidad por accidente | ⚠️ requiere owner desde la web |
| Cada dueño `admin` solo en su repo | ídem | ✅ |
| **Protección de `main`** en los 9 repos: PR obligatorio, 1 aprobación, check `ci` verde, sin force push, sin borrar, admins incluidos | push directo, merges sin revisar, código que no compila | ✅ |
| Solo **squash merge**, borrar rama al merge | historial ilegible, ramas huérfanas | ✅ |
| **CODEOWNERS** en cada repo | que un cambio al servicio de alguien se apruebe sin que se entere | ✅ |
| **Dependabot** alertas y actualizaciones de seguridad | dependencias con CVE conocidas | ✅ |
| **Secret scanning + push protection** | subir una llave por accidente | ✅ en repos públicos (gratis); en privados requiere plan de pago |
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

---

## 6 · Qué hacer si se filtra un secreto

1. **Rotar** el secreto en Railway (variables compartidas) y redesplegar. Con `JWT_SECRET` nuevo, todos los tokens anteriores dejan de valer: los usuarios vuelven a entrar desde `/`.
2. Si fue la llave de Anthropic: revocarla en la consola de Anthropic y crear otra.
3. Si quedó en un commit: **no basta con borrarlo en otro commit.** Hay que reescribir el historial (`git filter-repo`) y forzar el push, o dar el secreto por quemado y rotarlo. Rotar es más rápido y más seguro.
4. Abrir un issue con la etiqueta `bug` describiendo qué se filtró y qué se rotó, sin pegar el secreto.
