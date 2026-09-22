import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";
import { submissionScope } from "@/lib/marking/access";
import { runMarking } from "@/lib/marking/run";

/** Reading a multi-page paper is slow work; don't cut it off at the default. */
export const maxDuration = 300;

export const POST = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const submission = await prisma.submission.findFirst({
    where: { id: params.id, ...submissionScope(viewer) },
    select: { id: true, status: true, updatedAt: true },
  });
  if (!submission) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Marking costs money per press, so cap it well above what a real tutor does
  // and well below a runaway loop.
  const rl = rateLimit(`mark:${viewer.id}`, 40, 600);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  // A second press while the first run is still going would mark the same paper
  // twice and race over the same mark rows. The staleness window lets a run
  // killed by a container restart be retried rather than blocking forever.
  const STALE_AFTER_MS = 10 * 60 * 1000;
  if (submission.status === "MARKING" && Date.now() - submission.updatedAt.getTime() < STALE_AFTER_MS) {
    return NextResponse.json({ error: "This paper is already being marked." }, { status: 409 });
  }
  if (submission.status === "REVIEWED") {
    return NextResponse.json(
      { error: "This paper has been marked by a person. Re-marking it would throw that away." },
      { status: 409 }
    );
  }

  const result = await runMarking(submission.id);
  await audit({
    organisationId: viewer.organisationId,
    actorId: viewer.id,
    action: "submission.mark",
    target: `submission:${submission.id}`,
    metadata: { status: result.status, reason: result.reason ?? null },
  });
  return NextResponse.json(result);
});
