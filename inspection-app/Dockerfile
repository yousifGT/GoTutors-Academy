# Build and run the GoTutors inspection app.
#
#   docker build -t gotutors-inspection ./inspection-app
#   docker run -p 3100:3100 --env-file inspection-app/.env gotutors-inspection
#
# Multi-stage so the image ships the built app and production dependencies only,
# not the toolchain. Next's standalone output is not used: the app reads photo
# uploads from disk at request time, and standalone's file tracing does not carry
# a directory written to at runtime.

FROM node:20-slim AS deps
WORKDIR /app
# openssl is required by Prisma's query engine on slim images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:20-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next build needs these present; they are not baked into the image, and the
# real values come from the environment at run time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXTAUTH_SECRET="build-time-placeholder"
ENV NEXTAUTH_URL="http://localhost:3100"
RUN npm run build && npm prune --omit=dev

FROM node:20-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3100

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/data ./data
COPY --from=build /app/core ./core

# Photos and signatures are written here. Mount a volume over it, or set
# UPLOAD_BACKEND=s3 — a container filesystem does not survive a redeploy.
RUN mkdir -p public/uploads && chown -R node:node public/uploads
USER node

EXPOSE 3100

# Migrations are NOT run here. Two instances starting at once would both try,
# and a failed migration would take the whole rollout down rather than one
# container. Run `npm run db:deploy` as a release step before starting these.
CMD ["npm", "run", "start"]
