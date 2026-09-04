import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canDecideHeadRequest } from "@/lib/access";
import { setCentreHeads, nameList } from "@/lib/head-request";

type Ctx = { params: Promise<{ id: string }> };

const DecideSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).optional(),
});

/**
 * A super admin answering a franchisee's request.
 *
 * Approving adds the requested person to the centre's existing heads rather
 * than replacing them: the request asked for one person, and reading it as
 * "and nobody else" would quietly remove whoever is already there. Removing a
 * head of centre is a separate act, done deliberately through
 * `PUT /api/centres/:id/heads`.
 *
 * Rejecting records the decision and the reason, and changes nothing. Either
 * way the request stops being pending, so the same one cannot be answered
 * twice — the status is re-checked inside the write, not only before it.
 */
export const POST = withRoute(async (req: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  if (!canDecideHeadRequest(who.viewer.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, DecideSchema);
  if (!parsed.ok) return parsed.response;

  const request = await prisma.centreHeadRequest.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      centreId: true,
      headId: true,
      centre: { select: { name: true, managers: { select: { id: true, role: true } } } },
      head: { select: { name: true } },
      askedBy: { select: { name: true } },
    },
  });
  if (!request) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (request.status !== "PENDING")
    return NextResponse.json(
      { error: `This request was already ${request.status.toLowerCase()}.` },
      { status: 409 }
    );

  // Claim the request first. If two admins press approve at the same moment,
  // the second update matches no pending row and stops here, before anything
  // has been changed at the centre.
  const claimed = await prisma.centreHeadRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data: {
      status: parsed.data.decision,
      decidedById: who.viewer.id,
      decidedAt: new Date(),
      decisionNote: parsed.data.note || null,
    },
  });
  if (claimed.count === 0)
    return NextResponse.json({ error: "This request was just answered by somebody else." }, { status: 409 });

  let managers: unknown = undefined;
  if (parsed.data.decision === "APPROVED") {
    const heads = request.centre.managers.filter((m) => m.role === "CENTRE_HEAD").map((m) => m.id);
    const result = await setCentreHeads(request.centreId, [...heads, request.headId]);
    if (!result.ok) {
      // The account was deactivated or its role changed between the request and
      // the decision. Put the request back so the admin sees why, rather than
      // burning it on a change that did not happen.
      await prisma.centreHeadRequest.update({
        where: { id: request.id },
        data: { status: "PENDING", decidedById: null, decidedAt: null, decisionNote: null },
      });
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    managers = result.managers;
    await audit({
      actorId: who.viewer.id,
      action: "centre.heads",
      target: request.centreId,
      metadata: { centre: request.centre.name, was: nameList(result.was), now: nameList(result.now) },
    });
  }

  await audit({
    actorId: who.viewer.id,
    action: "centre.head_request_decided",
    target: request.centreId,
    metadata: {
      centre: request.centre.name,
      head: request.head.name,
      askedBy: request.askedBy.name,
      decision: parsed.data.decision,
      request: request.id,
      note: parsed.data.note ?? null,
    },
  });

  return NextResponse.json({ ok: true, status: parsed.data.decision, managers });
});
