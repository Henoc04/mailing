import { PrismaClient } from "@prisma/client";

/**
 * `tsx watch` (used by `npm run dev`) hot-reloads `src/server.ts` on every
 * file change without restarting the Node process. Without this guard, each
 * reload would instantiate a brand new PrismaClient (and its connection
 * pool) while the previous one is never closed, quickly exhausting MySQL
 * connections. We cache the instance on `globalThis` so reloads reuse it.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

export const prisma: PrismaClient = globalThis.__prisma__ ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma__ = prisma;
}
