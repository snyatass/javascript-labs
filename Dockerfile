# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ARG GIT_SHA=dev
ENV NODE_ENV=production
ENV GIT_SHA=$GIT_SHA
ENV HOST=0.0.0.0
ENV PORT=3000
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev --workspace=@spaceship/server
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server/src ./server/src
COPY --from=builder /app/shared ./shared
RUN addgroup --system spaceship && adduser --system --ingroup spaceship spaceship \
  && chown -R spaceship:spaceship /app
USER spaceship
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server/src/main.js"]
