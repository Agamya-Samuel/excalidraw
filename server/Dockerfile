FROM node:24 AS build

WORKDIR /opt/node_app

COPY . .

RUN corepack enable && yarn install --immutable

RUN yarn workspace server build

FROM node:24-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY server/package.json ./package.json
COPY server/package-lock.json ./package-lock.json
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=build /opt/node_app/server/dist ./dist
COPY --from=build /opt/node_app/server/migrations ./migrations

EXPOSE 8080 3002

CMD ["node", "dist/api.js"]
