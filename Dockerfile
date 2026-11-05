# The AdForge worker: job pools, FFmpeg and Remotion rendering in one image.
#
# Railway picks this file up from the repository root on its own. To run it anywhere else:
#   docker build -t adforge-worker .
#   docker run --env-file .env -p 8080:8080 adforge-worker
#
# The web app does not use this image; it deploys to Vercel.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

# ---------------------------------------------------------------- build ----
FROM base AS build
# Manifests first, so dependencies are only reinstalled when they change. Every workspace manifest
# is copied so the workspace matches the lockfile; only the worker's dependencies are installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/compositions/package.json packages/compositions/
RUN pnpm install --frozen-lockfile --filter "@adforge/worker..."

COPY apps/worker apps/worker
COPY packages packages
# Compile the worker, pre-bundle the Remotion compositions so the first render starts at once,
# then copy the worker with production dependencies only into /out.
RUN pnpm --filter @adforge/worker build \
 && pnpm --filter @adforge/worker bundle:site \
 && pnpm --filter @adforge/worker deploy --prod --legacy /out \
 && rm -rf /out/src /out/dist /out/.remotion-bundle \
 && cp -r apps/worker/dist apps/worker/.remotion-bundle /out/

# -------------------------------------------------------------- runtime ----
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
# FFmpeg for the media pipeline; the libraries Chrome Headless Shell needs (the list Remotion
# documents); Noto fonts so captions in any script and emoji render instead of empty boxes; and
# tini, so Chrome's child processes are reaped and signals reach Node.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates ffmpeg tini \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev libxfixes3 \
      libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
      fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node --from=build /out ./
# Chrome Headless Shell goes into node_modules/.remotion, where renders look for it.
RUN node -e "import('@remotion/renderer').then((r) => r.ensureBrowser({ logLevel: 'info' }))"

ENV NODE_ENV=production \
    WORKER_TMP_DIR=/tmp/adforge \
    WORKER_PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/index.js"]
