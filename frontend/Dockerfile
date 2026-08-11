# Imagen de producción del frontend Next.js (UI).
# Contexto de build = RAÍZ del repo (necesita config/deployment.config.json,
# que frontend/lib/deployment-config.ts importa como "../../config/...", fuera
# de frontend/ — con contexto ./frontend, COPY nunca puede alcanzarlo).
#   docker build -f frontend/Dockerfile -t mapa-frontend .
# Multi-stage: deps -> build (standalone) -> runtime slim no-root.
# El worker y la API ya NO viven aquí (están en backend/).
FROM node:24-slim AS base
WORKDIR /app

# ---- deps: instala con el lockfile (mejor cache de capas) ----
FROM base AS deps
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# ---- builder: compila el server standalone ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
# La identidad del deployment, fuera de frontend/ en el repo real. El import
# relativo ("../../config/deployment.config.json" desde frontend/lib/) sube
# dos niveles desde /app/lib -> resuelve a /config/deployment.config.json
# dentro de la imagen, así que tiene que aterrizar EXACTAMENTE ahí.
COPY config/deployment.config.json /config/deployment.config.json
# Build id determinista (anti version-skew, ver next.config.ts). Sin setear -> "dev".
ARG APP_BUILD_SHA
ENV APP_BUILD_SHA=$APP_BUILD_SHA
# CDN para /_next/static (R2 + Cloudflare). Sin setear -> assets servidos por la app.
ARG NEXT_PUBLIC_ASSET_PREFIX
ENV NEXT_PUBLIC_ASSET_PREFIX=$NEXT_PUBLIC_ASSET_PREFIX
# OpenPanel (NEXT_PUBLIC_* se inlinea en build).
ARG NEXT_PUBLIC_OPENPANEL_CLIENT_ID
ENV NEXT_PUBLIC_OPENPANEL_CLIENT_ID=$NEXT_PUBLIC_OPENPANEL_CLIENT_ID
ARG NEXT_PUBLIC_OPENPANEL_PRODUCTION_HOST
ENV NEXT_PUBLIC_OPENPANEL_PRODUCTION_HOST=$NEXT_PUBLIC_OPENPANEL_PRODUCTION_HOST
ARG NEXT_PUBLIC_OPENPANEL_DASHBOARD_URL
ENV NEXT_PUBLIC_OPENPANEL_DASHBOARD_URL=$NEXT_PUBLIC_OPENPANEL_DASHBOARD_URL
ENV NEXT_TELEMETRY_DISABLED=1
# URL ABSOLUTA del backend (NEXT_PUBLIC_* -> build-arg). Dev: http://localhost:8080.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Base pública del bucket R2/CDN de fotos (no sensible). Las fotos se sirven vía
# el redirect del backend (/api/.../photo -> R2); esta var queda disponible para
# enlaces directos al CDN si se necesitan. Prod: https://cdn.example.org
ARG NEXT_PUBLIC_R2_PUBLIC_BASE
ENV NEXT_PUBLIC_R2_PUBLIC_BASE=$NEXT_PUBLIC_R2_PUBLIC_BASE
# Cloudflare Turnstile site key (público, se inlinea en build) para el widget.
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
# País por defecto del directorio de acopio / hub ResponseGrid (vacío = sin filtro).
ARG NEXT_PUBLIC_ACOPIO_DEFAULT_COUNTRY
ENV NEXT_PUBLIC_ACOPIO_DEFAULT_COUNTRY=$NEXT_PUBLIC_ACOPIO_DEFAULT_COUNTRY
RUN npm run build

# ---- runtime: slim, no-root ----
FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# OJO con este path: con este layout de contexto (raíz del repo + algo
# copiado fuera de /app, ver arriba), el output tracing de Next mete un nivel
# extra y el standalone queda en .next/standalone/app/ — NO en
# .next/standalone/ directo como cuando el contexto era solo frontend/.
# Verifica esto tras cualquier bump de Next: si "node server.js" arranca con
# MODULE_NOT_FOUND o falta server.js aquí, comprueba si volvió a ser
# .next/standalone/ sin el /app (build local: revisa la carpeta real bajo
# .next/standalone/ antes de asumir cuál de las dos rutas es). public/ y
# .next/static no se ven afectados: siempre quedan junto al build en /app.
COPY --from=builder --chown=node:node /app/.next/standalone/app ./
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
