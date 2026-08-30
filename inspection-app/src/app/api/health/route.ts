import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { usingS3 } from "@/lib/storage";
import { missingConfig } from "@/lib/s3";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness, for a load balancer's target group.
 *
 * Unauthenticated on purpose — a health check runs before anyone can sign in —
 * so it says whether each dependency answers and nothing about what it is. No
 * bucket names, no hostnames, no versions.
 *
 * A failing dependency is a 503: an instance that cannot reach its database or
 * its object store should be taken out of rotation, not left serving errors.
 */

/** The object store is checked at most this often; the balancer polls far more. */
const STORE_CHECK_MS = 60_000;
let lastStoreCheck = { at: 0, ok: false };

export async function GET() {
  const [db, storage] = await Promise.all([checkDb(), checkStorage()]);
  const ok = db && storage;
  return NextResponse.json(
    { ok, db, storage },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}

async function checkDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (e) {
    console.error("health: database unreachable", e);
    return false;
  }
}

async function checkStorage(): Promise<boolean> {
  // Local disk is the same filesystem the process is running from. If that were
  // gone there would be nothing left to answer the request.
  if (!usingS3()) return true;

  const missing = missingConfig();
  if (missing.length) {
    console.error("health: UPLOAD_BACKEND=s3 but not configured", { missing });
    return false;
  }

  const now = Date.now();
  if (now - lastStoreCheck.at < STORE_CHECK_MS) return lastStoreCheck.ok;

  let ok = false;
  try {
    await (await import("@/lib/s3")).default.check();
    ok = true;
  } catch (e) {
    console.error("health: object store unreachable", e);
  }
  lastStoreCheck = { at: now, ok };
  return ok;
}
