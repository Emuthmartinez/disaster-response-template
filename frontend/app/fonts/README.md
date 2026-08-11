# Tipografías auto-alojadas

`app/layout.tsx` carga Nunito (`--font-display`) y Source Sans 3
(`--font-body`) con `next/font/local` en vez de `next/font/google`.

## Por qué

`next/font/google` descarga los `.woff2` desde Google en **tiempo de build**.
Un fallo de red transitorio en ese momento rompe el build entero — no es
hipotético: en un deployment real de este template, un run de CI falló con un
error de módulo no encontrado apuntando a la fuente de Google Fonts, y el
mismo commit re-ejecutado sin cambios pasó limpio. Si tu pipeline de CI
despliega a producción en cada push a `main` (el target por defecto de este
template en Cloudflare Workers, ver `frontend/wrangler.jsonc`), ese parpadeo
de red tumba un despliegue con una traza que parece un error de código, no lo
que realmente es.

Con los ficheros de fuente versionados aquí, `next build` no habla con la red
para tipografía: cero dependencia externa en build.

## Qué hay aquí

- `nunito-latin-variable.woff2` — Nunito, subset `latin`, fuente variable
  (pesos 800–900 en un solo fichero). Fuente: [Google Fonts / Nunito](https://fonts.google.com/specimen/Nunito).
- `source-sans-3-latin-variable.woff2` — Source Sans 3, subset `latin`, fuente
  variable (pesos 400–700 en un solo fichero). Fuente: [Google Fonts / Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3).
- `OFL-nunito.txt` / `OFL-source-sans-3.txt` — licencia SIL Open Font License
  1.1 de cada familia (redistribución permitida; solo prohíbe vender la
  fuente por sí sola bajo el mismo nombre).

Ambos son ficheros **variables** (tabla `fvar`): un solo `.woff2` cubre todo
el rango de peso usado por el sitio, por eso `weight` en `layout.tsx` es un
rango (`"800 900"`, `"400 700"`) y no una lista de pesos sueltos.

## Si cambias de tipografía

1. Descarga el/los `.woff2` en subset `latin` desde Google Fonts (o vendor la
   fuente que uses).
2. Sustituye los ficheros de esta carpeta y su(s) licencia(s).
3. Actualiza los `localFont({...})` en `app/layout.tsx` (rutas, pesos,
   `variable`). Los NOMBRES de las variables CSS (`--font-display`,
   `--font-body`) no deberían cambiar: `app/globals.css` los consume.
4. `adjustFontFallback: "Arial"` es la capa anti-CLS: Next lee las métricas
   del fichero y genera un `@font-face` de fallback con
   ascent/descent/size-adjust ajustados. Mantenlo salvo que tengas una razón
   concreta para no hacerlo.
5. Quita `fonts.googleapis.com` / `fonts.gstatic.com` de la CSP
   (`next.config.ts`) si ya no cargas nada desde Google Fonts — de lo
   contrario son orígenes permitidos que el sitio no usa.
