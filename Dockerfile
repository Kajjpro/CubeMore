# One image that runs the whole app: the Node server, which also serves the
# built website. Build with:  docker build -t cube-racing .

# ---- Stage 1: install everything and build the website ----
FROM node:24-slim AS build
WORKDIR /app

# Copy only the package files first, so "npm ci" is cached until they change.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY . .
# Accounts (Clerk): the publishable key is baked into the website when it's built.
# Render passes the service's environment variables in as build arguments; on Fly,
# set it under [build.args] in fly.toml. Empty = no sign-in, everyone is a guest.
ARG VITE_CLERK_PUBLISHABLE_KEY=""
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
# The site's public address, for link previews, robots.txt and the sitemap.
ARG VITE_SITE_URL=""
ENV VITE_SITE_URL=$VITE_SITE_URL
RUN npm run build

# ---- Stage 2: the small image that actually runs ----
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# Only what the server needs to run (no Vite, no test tools).
RUN npm ci --omit=dev --workspace server && npm cache clean --force

COPY shared shared
COPY server server
COPY --from=build /app/client/dist client/dist

EXPOSE 8080
WORKDIR /app/server
# `node` runs directly (not through npm) so it receives the stop signal and
# can tell players "the server is restarting" before exiting.
CMD ["node", "--import", "tsx", "src/index.ts"]
