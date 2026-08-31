# Build and run the GoTutors inspection app.
#
#   docker build -t gotutors-inspection ./inspection-app
#   docker run -p 3100:3100 --env-file inspection-app/.env gotutors-inspection
#
# Multi-stage so the image ships the built app and production dependencies only,
# not the toolchain. Next's standalone output is not used: on the default local
# backend the app reads photo uploads from disk at request time, and standalone's
# file tracing does not carry a directory written to at runtime.

# Node 22: Next 16 requires >= 20.9, and Node 20 is out of support.
FROM node:22-slim AS deps
WORKDIR /app
# openssl is required by Prisma's query engine on slim images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-slim AS build
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
RUN npm run build
# Turbopack's cache is ~100MB and is of no use at run time.
RUN rm -rf .next/cache

# Migrations and maintenance. Keeps the dev dependencies, `prisma` and `tsx`, and
# the scripts — none of which the serving image has, because it is pruned. The
# release step (`npm run db:deploy`) and `uploads:gc` run from a one-off task of
# THIS image, built from the same commit as the one being deployed.
FROM build AS tools
WORKDIR /app
ENV NODE_ENV=production
CMD ["npm", "run", "db:deploy"]

FROM node:22-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3100

# From `build`, not from `deps`: `npm run build` runs `prisma generate`, which
# writes the generated client into node_modules. Copying the pre-build tree
# would ship an image whose every query fails at run time.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
# Read at run time, not baked into the build: without it `poweredByHeader` and
# the rewrite that sends legacy /uploads paths through the authenticated route
# both silently revert to their defaults in the container.
COPY --from=build /app/next.config.js ./next.config.js
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/data ./data
COPY --from=build /app/core ./core

# Pruned here rather than in the build stage, so the `tools` stage above keeps
# the toolchain the release step needs. `@prisma/client` is a real dependency,
# so the generated client copied above survives; the `prisma` CLI and `tsx` do
# not, which is the point.
RUN npm prune --omit=dev && npm cache clean --force

# Photos and signatures land here on the default backend. Deliberately NOT under
# public/: Next serves anything it finds there as a static file, with no session
# and no scope check, which would put every photograph one guessed URL away from
# anybody. In production set UPLOAD_BACKEND=s3 instead — this directory does not
# survive a redeploy, and two tasks cannot see each other's files. Kept writable
# so a single-machine install still works.
RUN mkdir -p var/uploads && chown -R node:node var/uploads
USER node

EXPOSE 3100

# Returns 503 when the database or the object store cannot be reached, so a task
# that cannot serve photos is taken out of rotation rather than left failing
# uploads. A load balancer should point its target-group check at the same path.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations are NOT run here. Two instances starting at once would both try,
# and a failed migration would take the whole rollout down rather than one
# container. Run `npm run db:deploy` as a release step, from a one-off task of
# the `tools` stage — this image is pruned and has no `prisma` binary.
# Next directly, not through npm. As PID 1 npm has no default disposition for
# SIGTERM and does not forward it, so ECS replacing a task would wait out the
# stop timeout and then SIGKILL — losing whatever was in flight. Next's own
# graceful shutdown exists and only fires if the signal reaches it. Verified
# locally: an in-flight PDF render completes after SIGTERM and the process then
# exits.
# An ALB holds an idle keep-alive socket for 60s; Node closes it at 5s, and the
# reset that follows arrives as a 502 the load balancer will not retry on a POST.
CMD ["node", "node_modules/next/dist/bin/next", "start", "--keepAliveTimeout", "65000"]
