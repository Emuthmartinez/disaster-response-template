# Imagen de producción del panel admin (Next.js standalone, app plana).
# Multi-stage: deps → builder → runtime no-root.
# Node >=24 (engines en package.json).

FROM node:24-slim AS base
WORKDIR /app

# ---- deps: instala solo con lockfile (mejor caché de capas) ----
FROM base AS deps
COPY package.json package-lock.json ./
# ci reproducible; fallback a install si el lock drifta (optional-dep / versión
# de npm). CI commitea el lock corregido de vuelta.
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# ---- builder: compila el server standalone ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Asegura que public/ exista para que el COPY del runtime nunca falle (Next 16
# puede no tener public/ todavía).
RUN mkdir -p /app/public
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime: mínimo, no-root ----
FROM node:24-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# server.js escucha en PORT / HOSTNAME (docs Next standalone).
# 0.0.0.0 para que los health checks del Service/LB de k8s alcancen el contenedor.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# node:24-slim trae un usuario no-root `node` (uid 1000). Úsalo.
# App plana: standalone deja server.js + node_modules en la raíz.
COPY --from=builder --chown=node:node /app/.next/standalone ./

# Los estáticos y public/ NO van en standalone — cópialos para que server.js los
# sirva directo (docs Next standalone).
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000
# App plana: server.js queda en la raíz.
CMD ["node", "server.js"]
