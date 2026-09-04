import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Withdrawing a request, by the person who raised it.
 *
 * The row is kept and marked withdrawn rather than deleted: who asked for
 * access to a centre's records, and thought better of it, is part of the same
 * record as who was granted it.
 */
export const DELETE = withRoute(async (_req: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const request = await prisma.centreHeadRequest.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      askedById: true,
      centreId: true,
      centre: { select: { name: true } },
      head: { select: { name: true } },
    },
  });
  if (!request) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (request.askedById !== who.viewer.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (request.status !== "PENDING")
    return NextResponse.json(
      { error: `This request was already ${request.status.toLowerCase()}.` },
      { status: 409 }
    );

  const claimed = await prisma.centreHeadRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data: { status: "WITHDRAWN", decidedAt: new Date() },
  });
  if (claimed.count === 0)
    return NextResponse.json({ error: "This request was just answered." }, { status: 409 });

  await audit({
    actorId: who.viewer.id,
    action: "centre.head_request_withdrawn",
    target: request.centreId,
    metadata: { centre: request.centre.name, head: request.head.name, request: request.id },
  });

  return NextResponse.json({ ok: true, status: "WITHDRAWN" });
});
