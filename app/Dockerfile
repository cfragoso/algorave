FROM node:22-bookworm-slim AS build
WORKDIR /project/app
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /project/app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /project/app/ ./
COPY --chown=node:node songs/ /project/songs/
COPY --chown=node:node vocals/strudel.json /project/vocals/strudel.json
COPY --chown=node:node controllers/launch-control-xl/mapping.json /project/controllers/launch-control-xl/mapping.json
USER node
EXPOSE 3000
CMD ["node", "server.js"]
