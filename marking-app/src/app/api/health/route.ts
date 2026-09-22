import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { describeEnvProblems, describeEnvWarnings } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * One request that says whether this deployment is actually usable.
 *
 * Config problems are reported here rather than thrown at boot, so a bad
 * setting shows up as an unhealthy task (and an automatic rollback) instead of
 * a crash loop that is harder to read.
 */
export async function GET() {
  const problems = describeEnvProblems();
  let database = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    database = "unreachable";
    console.error("health check: database unreachable", err);
  }

  const healthy = problems.length === 0 && database === "ok";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "unhealthy",
      database,
      config: problems.length === 0 ? "ok" : problems,
      warnings: describeEnvWarnings(),
      commit: process.env.GIT_COMMIT ?? null,
    },
    { status: healthy ? 200 : 503 }
  );
}
