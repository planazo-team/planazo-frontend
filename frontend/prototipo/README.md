# Planazo — sitio del proyecto

Sitio estático con los entregables del proyecto. No requiere build ni dependencias.

## Desplegar en Netlify

### Opción 1 — arrastrar y soltar (lo más rápido)

1. Entra a https://app.netlify.com/drop
2. Arrastra **esta carpeta completa** (`planazo-site`) a la zona de la página.
3. Netlify te da una URL en unos segundos.

No necesitas cuenta para probar, pero si inicias sesión el sitio queda guardado
y puedes cambiarle el nombre en *Site settings → Change site name*.

### Opción 2 — Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify deploy --dir=. --prod
```

### Opción 3 — desde GitHub

1. Sube esta carpeta a un repositorio.
2. En Netlify: *Add new site → Import an existing project*.
3. Build command: **vacío**. Publish directory: **.** (la raíz).

## Contenido

| Archivo | Qué es |
|---|---|
| `index.html` | Portada con enlaces a todo |
| `prototipo.html` | App del cliente + panel del establecimiento |
| `story-map.html` | Story mapping con MoSCoW y los hilos de flujo |
| `caso-negocio.html` | Caso de negocio con investigación de mercado |
| `brief.html` | Brief técnico del proyecto |
| `descargas/` | Documentos Word y el contexto en texto plano |

## Rutas cortas

Definidas en `_redirects`:

- `/prototipo`
- `/storymap`
- `/caso`
- `/brief`

## Notas

- Todo es estático: HTML, CSS y JavaScript en el mismo archivo. No hay backend.
- Las fuentes se cargan desde Google Fonts; si el sitio se abre sin conexión,
  cae a las tipografías del sistema sin romperse.
