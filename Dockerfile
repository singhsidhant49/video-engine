FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    HF_HOME=/app/.cache/huggingface \
    TRANSFORMERS_CACHE=/app/.cache/huggingface \
    XDG_CACHE_HOME=/app/.cache \
    NODE_OPTIONS="--max-old-space-size=4096" \
    REMOTION_LOG_LEVEL=warn

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl fonts-liberation fonts-noto-color-emoji \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
    libgbm1 libglib2.0-0 libgtk-3-0 libnss3 libpango-1.0-0 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 \
    libxfixes3 libxkbcommon0 libxrandr2 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
# Remotion's CLI is a development dependency but is required once at image
# build time to install the matching headless browser. npm 11 requires an
# explicit allow-list for native package install scripts.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev --fetch-retries=8 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=120000 --fetch-timeout=600000 --prefer-offline && \
    npx --no-install remotion browser ensure

COPY --chown=node:node . .
RUN mkdir -p /app/renders /app/temp /app/.cache /app/node_modules/.cache && \
    chown -R node:node /app/renders /app/temp /app/.cache /app/node_modules/.cache
USER node

EXPOSE 3000
CMD ["npm", "start"]
