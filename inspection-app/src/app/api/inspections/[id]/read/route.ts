import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { viewerOr401 } from "@/lib/session";

type Ctx = { params: { id: string } };

/**
 * Mark a delivered report as read.
 *
 * Only ever marks the caller's own delivery, and only the first time — the
 * timestamp records when they actually opened it, so re-reading later must not
 * move it.
 */
export const POST = withRoute(async (_req: Request, { params }: Ctx) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const { count } = await prisma.reportDelivery.updateMany({
    where: { inspectionId: params.id, userId: who.viewer.id, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true, marked: count });
});
