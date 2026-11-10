# SonarCloud en el CI de PLANAZO (ESC-05, inspección continua)

> HU-139 (investigación), HU-141/142 (Sonar en el CI) y HU-143 (Quality Gate obligatorio).
> Escenario **ESC-05 · Mantenibilidad**: cada PR pasa por análisis estático en menos de 10 minutos, con calificación **A**, cobertura **≥ 80 %** en el backend y **≥ 40 %** en el frontend (bono de 0,5).

## 1. Cómo encaja SonarCloud con GitHub Actions

```
PR abierto ─▶ GitHub Actions (ci.yml)
               ├─ npm ci / typecheck / lint
               ├─ pruebas con cobertura ──▶ coverage/lcov.info (Jest) · target/site/jacoco/jacoco.xml (JaCoCo)
               └─ escáner de Sonar ──(SONAR_TOKEN)──▶ sonarcloud.io
                                                      ├─ calcula issues, duplicación y cobertura del código nuevo
                                                      ├─ evalúa el Quality Gate
                                                      └─ app de GitHub: comenta el PR y publica el check
                                                           «SonarCloud Code Analysis» (verde/rojo)
```

| Pieza | Qué hace en PLANAZO |
|---|---|
| **`SonarSource/sonarqube-scan-action`** | Escáner oficial para TypeScript/JavaScript. Fijado a la versión **v8.4.1** por SHA (`e805d87…`) para que una versión nueva no cambie el CI sin avisar. Lee `sonar-project.properties` en la raíz del repo. Se usa en api-gateway, booking, promo, realtime, service-template y frontend. |
| **SonarScanner para Maven** | En `planazo-game` (Java 21) Sonar recomienda el plugin de Maven en vez del action: `mvn verify` corre las pruebas y JaCoCo, y luego `mvn org.sonarsource.scanner.maven:sonar-maven-plugin:sonar` sube el análisis reutilizando `target/`. La configuración vive en las `<properties>` del `pom.xml` (el escáner de Maven no lee `sonar-project.properties`). |
| **`SONAR_TOKEN`** | Token de SonarCloud que autoriza al CI a subir análisis. Va como **secreto de la organización** de GitHub (`planazo-team`), así los 7 repos lo heredan. El CI lo pasa solo al paso del escáner. |
| **Paso condicional** | Un paso previo revisa si el secreto existe; si no, el análisis se salta con un aviso (`::notice`) y el CI sigue en verde. Así los PRs no se bloquean mientras se crea la organización, y los PRs de Dependabot (que no reciben secretos de Actions) tampoco fallan. |
| **`fetch-depth: 0`** | El checkout trae todo el historial: Sonar lo usa para el *blame* y para saber qué líneas son «código nuevo». |
| **Decoración del PR** | La app de GitHub de SonarCloud comenta en el PR el resumen (issues nuevos, cobertura y duplicación del código nuevo) y publica un check con el resultado del Quality Gate. No hace falta configurar nada en el workflow: SonarCloud detecta el PR por las variables de GitHub Actions. |
| **Quality Gate** | Conjunto de condiciones sobre el **código nuevo** del PR. Con el plan gratis se usa el gate por defecto **Sonar way**: calificaciones A en confiabilidad, seguridad y mantenibilidad, 100 % de *security hotspots* revisados, **cobertura ≥ 80 %** y **duplicación ≤ 3 %**. Coincide con la meta del backend del ESC-05. |
| **Check obligatorio** | Con una regla de protección de `main` que exija el check «SonarCloud Code Analysis», GitHub no deja mergear un PR que no pase el gate. |
| **Badges** | Cada README muestra el Quality Gate y la cobertura del proyecto. |

### Cobertura por repo

| Repo | Herramienta | Reporte | Estado hoy |
|---|---|---|---|
| api-gateway | Jest (cuando tenga pruebas) | `coverage/lcov.info` | Sin pruebas: el paso `npm run test --if-present` queda listo (HU-119) |
| booking, promo, realtime, service-template | Jest `--coverage` | `coverage/lcov.info` | Generando lcov en cada CI |
| game | JaCoCo 0.8.15 | `target/site/jacoco/jacoco.xml` | Generando el XML en `mvn verify` |
| frontend | Jest o Vitest (cuando tenga pruebas) | `frontend/coverage/lcov.info` | Sin pruebas: el paso `npm run test --if-present -- --coverage` queda listo (HU-146/148) |

## 2. ¿El plan gratis cubre repos privados?

**Sí, con límites.** Lo verificamos en la [página de planes de SonarQube Cloud](https://docs.sonarsource.com/sonarqube-cloud/administering-sonarcloud/managing-subscription/subscription-plans) el 10 de noviembre de 2026:

| Condición del plan Free | ¿Nos sirve? |
|---|---|
| Proyectos privados hasta **50 000 líneas de código** en total (se cuenta la rama más grande de cada proyecto) | Sí. Los 7 repos suman unas **18 000** líneas hoy (frontend ~9 400, game ~3 500, booking ~1 900, promo ~1 500, realtime ~700, api-gateway ~700, service-template ~500). |
| Hasta **5 miembros** en la organización | Sí. Somos 4. |
| Análisis de ramas: **solo la rama principal** | Sí. Trabajamos con `main` + ramas de PR. |
| Análisis de PRs: **solo si el destino es la rama principal** | Sí. Todos los PRs van a `main`. En game, los PRs a `develop` no se analizarían. |
| **Sin Quality Gates ni perfiles personalizados**: solo *Sonar way* | Sirve para el backend (pide 80 % en el código nuevo). Para el frontend es más exigente que el ESC-05 (40 %): ver la nota abajo. |

**Ojo con el código nuevo sin pruebas.** Sonar way exige 80 % de cobertura sobre las líneas nuevas de cada PR (los PRs con menos de 20 líneas nuevas no se evalúan por cobertura). En api-gateway y en el frontend, que aún no tienen pruebas, un PR grande saldría en rojo por cobertura hasta que existan las pruebas de HU-119 y HU-146/148. Opciones mientras tanto:

1. Exigir el check de SonarCloud como obligatorio solo en los repos que ya tienen pruebas (booking, promo, realtime, service-template, game), y sumarlos cuando lleguen.
2. Si el equipo necesita un gate a la medida (40 % en el frontend, o medir la cobertura total y no solo la del código nuevo), pasar al **plan B**.

### Plan B: SonarQube Community Build en Railway

Si el plan gratis deja de alcanzar (más de 50 000 líneas, más de 5 personas o un gate propio), se monta **SonarQube Community Build** (gratis, autoalojado) en Railway:

1. Nuevo servicio en el proyecto de Railway con la imagen `sonarqube:community` y un PostgreSQL propio (`SONAR_JDBC_URL`, `SONAR_JDBC_USERNAME`, `SONAR_JDBC_PASSWORD`). Necesita al menos 2 GB de RAM y un volumen en `/opt/sonarqube/data`.
2. Crear los 7 proyectos con las mismas claves (`planazo-team_<repo>`) y un token de análisis.
3. En GitHub, agregar el secreto `SONAR_HOST_URL` (la URL pública del servicio) además de `SONAR_TOKEN`, y pasarlo como `env` al paso del escáner. En game, `-Dsonar.host.url=${SONAR_HOST_URL}`.
4. Crear un Quality Gate propio: 80 % en backend y 40 % en frontend, sobre el código nuevo o el total.

Lo que se pierde: la Community Build **no decora PRs ni analiza ramas** (solo `main`), así que el gate se haría cumplir con `-Dsonar.qualitygate.wait=true` en el CI (el job falla si el gate falla) en vez del check de la app. Por eso SonarCloud Free sigue siendo la primera opción.

## 3. Pasos manuales (le tocan al equipo, no al CI)

Hacerlos con la cuenta de GitHub que es **owner** de `planazo-team`:

1. **Crear la organización en SonarCloud.** Entrar a [sonarcloud.io](https://sonarcloud.io) → *Log in with GitHub* → *+* → *Create new organization* → *Import from GitHub* → elegir `planazo-team` e instalar la app de SonarCloud en la organización (todos los repos o los 7 de PLANAZO). Clave de la organización: **`planazo-team`**. Plan: **Free**.
2. **Importar los 7 repos** (*Analyze new project*): api-gateway, booking, promo, realtime, service-template, game y frontend. Verificar que cada proyecto quede con la clave **`planazo-team_planazo-<repo>`**, que es la que esperan los `sonar-project.properties` y el `pom.xml`.
3. **Apagar el análisis automático** en cada proyecto: *Administration → Analysis Method → Automatic Analysis: off*. Si queda encendido, el análisis del CI falla con «You are running CI analysis while Automatic Analysis is enabled».
4. **Revisar la rama principal**: en *Administration → Branches and Pull Requests*, que la rama principal sea `main`.
5. **Crear el token**: *My Account → Security → Generate token* (tipo *Global Analysis Token* si lo ofrece, o uno de usuario). Copiarlo una sola vez.
6. **Guardar `SONAR_TOKEN` como secreto de la organización** en GitHub: `planazo-team` → *Settings → Secrets and variables → Actions → New organization secret* → nombre `SONAR_TOKEN`, acceso a los repos de PLANAZO. Con eso, el siguiente push o PR ya corre el análisis.
7. **Badges de repos privados**: los badges de un proyecto privado necesitan un token de badge. En cada proyecto, *Information → Get project badges*, copiar la URL y reemplazar la del README (agrega `&token=…`, que solo sirve para ver badges).
8. **Volver obligatorio el Quality Gate** (HU-143): en cada repo, *Settings → Branches → Branch protection rule* (o *Rules → Rulesets*) para `main` → *Require status checks to pass* → buscar **SonarCloud Code Analysis** (aparece después del primer PR analizado) y marcarlo junto con `ci`. Ver la nota de la sección 2 para api-gateway y frontend.

## 4. Cómo comprobar que funciona (evidencia para el ESC-05)

- En un PR: el job `ci` muestra el paso «Análisis estático (SonarCloud)» en verde, aparece el comentario del bot de SonarCloud y el check «SonarCloud Code Analysis».
- **Tiempo:** la duración del job `ci` en la pestaña *Actions* (meta: menos de 10 minutos de punta a punta).
- **Calificación y cobertura:** el resumen del proyecto en sonarcloud.io y los badges del README.
