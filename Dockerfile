# Production image for GoTutors Academy (Next.js + Prisma).
# Debian-slim base (not alpine) so Prisma's query engine works out of the box.
FROM node:20-slim

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first so Docker layer caching kicks in on code-only changes.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .

# DATABASE_URL isn't needed at build time (prisma generate reads the schema only),
# but Next statically checks env usage — provide a harmless placeholder.
ENV NODE_ENV=production
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
