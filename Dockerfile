# Production image for Finora (self-hosted). See deploy/README.md.
#
# Stages:
#   deps     – npm ci (also runs `prisma generate` via postinstall)
#   builder  – next build; also used by the one-shot `migrate` service (has the Prisma CLI)
#   runner   – minimal standalone server

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# The Prisma client is created at import time and requires a connection string. Nothing
# connects during the build, so a placeholder is enough; the real one is set at runtime.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
