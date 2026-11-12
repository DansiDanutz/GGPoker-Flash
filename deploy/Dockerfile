# Production image for the DanGG.ro game server and web client.
# Build context: repository root (see deploy/compose.yml).
FROM node:26-bookworm-slim AS build

RUN npm install -g pnpm@10.32.1
WORKDIR /src
COPY tools ./tools
COPY app/package.json app/pnpm-lock.yaml ./app/
WORKDIR /src/app
RUN pnpm install --frozen-lockfile
COPY app/ ./
# The commit being deployed; written to dist/version.json and reported by /healthz.
ARG GIT_SHA=""
RUN GIT_SHA="$GIT_SHA" pnpm build

FROM node:26-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=5198 \
    GGPOKER_DATA=/data

RUN npm install -g pnpm@10.32.1
WORKDIR /app
COPY app/package.json app/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY --from=build /src/app/server ./server
COPY --from=build /src/app/dist ./dist
COPY --from=build /src/app/public ./public

RUN mkdir -p /data && chown -R node:node /app /data
USER node
VOLUME ["/data"]
EXPOSE 5198

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5198/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
