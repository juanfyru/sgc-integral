# Imagen para linux/arm64 (QNAP TS-832PX). Construir SIEMPRE con:
#   docker buildx build --platform linux/arm64 -t sgc-suaza .
FROM node:24-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1

# --- Dependencias ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
# Verifica que el prebuild ARM64 de @node-rs/argon2 carga y funciona.
# Si falta el binario para linux/arm64, el build de CI truena aquí, no en el NAS.
RUN node -e "const{hashSync,verifySync}=require('@node-rs/argon2');if(!verifySync(hashSync('humo'),'humo'))process.exit(1)"

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Runtime (standalone: solo lo necesario, sin node_modules completo) ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3080
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3080

CMD ["node", "server.js"]
