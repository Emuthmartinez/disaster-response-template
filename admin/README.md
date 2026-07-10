# Panel admin

Panel de administración del mapa de emergencias. App Next.js standalone
(microservicio aparte del sitio público). El navegador llama same-origin al BFF
del propio panel (`app/api/*`), que reenvía al backend por la red interna.

## Requisitos

- Node >=24

## Arrancar

```bash
npm install
npm run dev        # desarrollo
npm run lint
npm run typecheck
npm run test
npm run build
```

## Estructura

```
admin/
├── app/      # Next App Router: páginas + BFF (app/api/*)
├── src/      # contexts (DDD), shared (auth/http), ui (atoms), config
└── tests/    # vitest
```
