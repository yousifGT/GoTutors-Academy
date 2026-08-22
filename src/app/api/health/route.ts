import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { describeEnvProblems } from "@/lib/env";

/**
 * Liveness/readiness check for the load balancer.
 *
 * The point is that it can fail. Pointing the health check at a static page
 * meant the service reported healthy for a day while the database was
 * unreachable — the load balancer was measuring whether Next.js could render
 * HTML, which was never in doubt. This touches the database and reports the
 * configuration, so a task that cannot actually serve requests is taken out of
 * service and a bad deploy rolls back on its own.
 *
 * Deliberately unauthenticated (the load balancer has no session) and
 * deliberately terse — it names which subsystem is unhappy, never why in
 * detail, so it isn't a reconnaissance tool.
 */

export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3000;

/** A hung database must fail the check, not hold the request open forever. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)),
  ]);
}

export async function GET() {
  const checks: Record<string, string> = {};
  let healthy = true;

  const startedAt = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DB_TIMEOUT_MS);
    checks.database = `ok (${Date.now() - startedAt}ms)`;
  } catch (e) {
    healthy = false;
    checks.database = e instanceof Error && e.message.startsWith("timed out") ? "unreachable (timeout)" : "unreachable";
  }

  const problems = describeEnvProblems();
  if (problems.length) {
    healthy = false;
    checks.config = `${problems.length} problem${problems.length === 1 ? "" : "s"}`;
  } else {
    checks.config = "ok";
  }

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      // Which build answered. Baked in at image build time, so a deployed
      // container can always be traced back to a commit — the smoke test prints
      // it, which is the only way to tell a stale rollout from a fresh one.
      commit: process.env.APP_COMMIT ?? "unknown",
      builtAt: process.env.APP_BUILT_AT ?? "unknown",
      checks,
    },
    {
      status: healthy ? 200 : 503,
      // Never let a proxy or browser serve a stale verdict.
      headers: { "cache-control": "no-store" },
    }
  );
}
