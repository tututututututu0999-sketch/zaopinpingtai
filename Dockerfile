FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
ARG NPM_REGISTRY=https://registry.npmjs.org/
RUN npm ci --include=optional --registry=${NPM_REGISTRY} --no-audit --no-fund --maxsockets=8 --fetch-retries=1 --fetch-timeout=600000 || { tail -n 60 /root/.npm/_logs/*debug-0.log; exit 1; }
# npm may skip a failed optional binary download. Fail here instead of letting
# Next.js silently download another platform's compiler during the build.
RUN node -e "require('@next/swc-linux-' + process.arch + '-musl')"
COPY . .
RUN npm_config_registry=${NPM_REGISTRY} npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/public ./public
COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/worker.mjs ./worker.mjs
COPY --from=base /app/visual-rules ./visual-rules
COPY --from=base /app/scripts ./scripts
COPY --from=base /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "scripts/start-app.mjs"]
