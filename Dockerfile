# ============================================================
#  Garage — vehicle diagnostic & maintenance
#
#  Single stage on purpose. Persistence uses the runtime's own
#  node:sqlite rather than a native npm module, so there is no
#  compile step, no node-gyp, and nothing to go wrong when you
#  rebuild on a different architecture.
# ============================================================
FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      wget ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=2026 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server ./server
COPY public ./public
COPY test ./test

# non-root, owning the data volume
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node

VOLUME ["/data"]
EXPOSE 2026

HEALTHCHECK --interval=30s --timeout=4s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:2026/healthz >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/index.js"]
