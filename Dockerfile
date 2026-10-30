# syntax=docker/dockerfile:1
# ABOUTME: Reproducible CPU-only Node deployment; no credential or local review material enters the image.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p public && pnpm design:tokens && pnpm exec next build --webpack

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
ENV ADAPTIVE_USAGE_DIR=/var/lib/adaptive
RUN mkdir -p /var/lib/adaptive && chown node:node /var/lib/adaptive
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/config/nemotron-candidate.env.example ./config/nemotron-candidate.env.example
COPY --from=builder --chown=node:node /app/scripts/start-hosted.mjs ./scripts/start-hosted.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-hosted.mjs"]
