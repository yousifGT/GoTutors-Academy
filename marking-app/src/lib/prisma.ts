import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

// Next's dev server re-evaluates modules on every edit; without this each edit
// opens another pool and the database runs out of connections.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
