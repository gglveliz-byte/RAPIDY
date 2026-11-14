# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Build: instala dependencias y compila cliente (Vite) + servidor
# (esbuild). El resultado es dist/public + dist/boot.js.
# ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Cachea la capa de dependencias mientras package*.json no cambie.
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .

# Variables públicas de Vite (no secretos). Se hornean en el bundle.
ARG VITE_NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
ARG VITE_NOMINATIM_EMAIL=
ENV VITE_NOMINATIM_BASE_URL=$VITE_NOMINATIM_BASE_URL \
    VITE_NOMINATIM_EMAIL=$VITE_NOMINATIM_EMAIL

# package.json: "vite build && esbuild server/boot.ts ... --outdir=dist"
# Vite escribe dist/public; esbuild escribe dist/boot.js.
RUN npm run build

# El bundle del servidor es autocontenido, pero se conservan las
# dependencias de producción para requires dinámicos/opcionales.
RUN npm prune --omit=dev

# ─────────────────────────────────────────────────────────────
# Runtime: solo artefactos compilados + dependencias de producción.
# Usuario no root (uid/gid 1001).
# ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --create-home --shell /usr/sbin/nologin app

COPY --from=build --chown=app:nodejs /app/package.json /app/package-lock.json ./
COPY --from=build --chown=app:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=app:nodejs /app/dist ./dist

USER app

EXPOSE 3000

STOPSIGNAL SIGTERM

# Liveness: /api/health responde 200 {"status":"ok"} sin consultar la DB.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Equivale a "npm start", pero sin shell intermedia.
# Requiere cwd=/app: serveStatic usa root "./dist/public" y
# server/lib/vite.ts resuelve "../dist/public" desde dist/boot.js.
CMD ["node", "dist/boot.js"]