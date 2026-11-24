FROM --platform=${BUILDPLATFORM} node:24@sha256:8530f76a96d88820d288761f022e318970dda93d01536919fbc16076b7983e63 AS build

WORKDIR /opt/node_app

COPY . .

# do not ignore optional dependencies:
# Error: Cannot find module @rollup/rollup-linux-x64-gnu
RUN --mount=type=cache,target=/root/.yarn/berry/cache \
    corepack enable && \
    npm_config_target_arch=${TARGETARCH} yarn install --immutable

ARG NODE_ENV=production
# Vite inlines VITE_* variables at build time. Defaults live in .env.production;
# these args allow overriding the same-origin/socket/cloud flags without editing files.
ARG VITE_APP_CLOUD_ENABLED=true
ARG VITE_APP_WS_SERVER_URL=
ENV VITE_APP_CLOUD_ENABLED=${VITE_APP_CLOUD_ENABLED}
ENV VITE_APP_WS_SERVER_URL=${VITE_APP_WS_SERVER_URL}

RUN npm_config_target_arch=${TARGETARCH} yarn build:app:docker

FROM nginx:stable-alpine-slim@sha256:2c605dbeab79a6b2a63340474fe58119d0ef95bdc4b1f41df0aa689659b3d13b

COPY --from=build /opt/node_app/excalidraw-app/build /usr/share/nginx/html
COPY excalidraw-app/nginx.conf /etc/nginx/conf.d/default.conf

HEALTHCHECK CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
