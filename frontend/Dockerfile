# Imagen de producción del frontend Next.js (UI). Contexto de build = frontend/.
# Multi-stage: deps -> build (standalone) -> runtime slim no-root.
# El worker y la API ya NO viven aquí (están en backend/).
FROM node:24-slim AS base
WORKDIR /app

# ---- deps: instala con el lockfile (mejor cache de capas) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# ---- builder: compila el server standalone ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
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
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
