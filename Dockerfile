# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY engine/package.json engine/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY engine engine
COPY server server
COPY web web
RUN npm run build -w basic-land-web && npm run build -w basic-land-server

FROM node:22-bookworm-slim
WORKDIR /app
# only the native module is installed at runtime (prebuilt binary for arm64 and amd64)
RUN npm init -y >/dev/null && npm i --omit=dev --no-audit --no-fund better-sqlite3@12
COPY --from=build /app/server/dist/main.js ./main.js
COPY --from=build /app/web/dist ./public
COPY deploy/healthcheck.js ./healthcheck.js
RUN mkdir /data && chown 1000:1000 /data
ENV NODE_ENV=production STATIC_DIR=/app/public DATA_DIR=/data PORT=3000
USER node
EXPOSE 3000
CMD ["node", "main.js"]
