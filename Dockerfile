FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
COPY backend/package*.json backend/
COPY frontend/package*.json frontend/
COPY cli/package*.json cli/

RUN npm ci

COPY . .

RUN npm run build -w backend && npm run build -w frontend

FROM node:24-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends nginx gettext-base curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only dsl schema (needed by AJV validator at runtime) and backend dist
COPY --from=build /app/dsl /app/dsl
COPY --from=build /app/backend/dist /app/backend/dist
COPY --from=build /app/frontend/dist/frontend/browser /srv/frontend

# Install only the backend's production dependencies, pinned by the root
# lockfile (npm ci needs every workspace manifest to validate it)
COPY package.json package-lock.json /app/
COPY backend/package.json /app/backend/
COPY frontend/package.json /app/frontend/
COPY cli/package.json /app/cli/
RUN npm ci --omit=dev -w backend && npm cache clean --force

COPY deploy/nginx/default.conf.template /app/deploy/nginx/default.conf.template
COPY deploy/start.sh /app/deploy/start.sh

RUN chmod +x /app/deploy/start.sh

ENV NODE_ENV=production
ENV PORT=8080
ENV BACKEND_PORT=3000

EXPOSE 8080

CMD ["/app/deploy/start.sh"]
