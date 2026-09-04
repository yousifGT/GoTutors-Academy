import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canRequestCentreHead } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

const RequestSchema = z.object({
  headId: z.string().min(1),
  note: z.string().trim().max(500).optional(),
});

/**
 * A franchisee asking for somebody to be made head of one of their centres.
 *
 * This route changes nothing about who runs the centre. It records a request; a
 * super admin approves or rejects it at `POST /api/head-requests/:id/decide`,
 * and only that approval moves anybody. Splitting it this way is the point: a
 * franchisee knows who is running their sites and should be able to say so
 * without waiting for somebody to be found, but handing out access to
 * inspection records is a decision that stays with the person accountable for
 * access.
 *
 * The named person must already have an active head of centre account, checked
 * here so the franchisee learns immediately rather than after an approval that
 * then fails, and checked again when the request is applied.
 */
export const POST = withRoute(async (req: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const centre = await prisma.centre.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, status: true, managers: { select: { id: true } } },
  });
  if (!centre) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!canRequestCentreHead(who.viewer, centre.managers.map((m) => m.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, RequestSchema);
  if (!parsed.ok) return parsed.response;

  const head = await prisma.user.findFirst({
    where: { id: parsed.data.headId, role: "CENTRE_HEAD", active: true },
    select: { id: true, name: true, email: true },
  });
  if (!head)
    return NextResponse.json(
      { error: "Only people who already have an active head of centre account can be requested." },
      { status: 400 }
    );

  if (centre.managers.some((m) => m.id === head.id))
    return NextResponse.json({ error: `${head.name} already runs this centre.` }, { status: 409 });

  // One open request per person per centre. Asking twice is not a second
  // request, it is the same one — and two pending rows would let one approval
  // leave the other dangling.
  const open = await prisma.centreHeadRequest.findFirst({
    where: { centreId: centre.id, headId: head.id, status: "PENDING" },
    select: { id: true },
  });
  if (open)
    return NextResponse.json(
      { error: `A request for ${head.name} is already waiting for approval.` },
      { status: 409 }
    );

  const created = await prisma.centreHeadRequest.create({
    data: {
      centreId: centre.id,
      headId: head.id,
      askedById: who.viewer.id,
      note: parsed.data.note || null,
    },
    select: { id: true, createdAt: true },
  });

  await audit({
    actorId: who.viewer.id,
    action: "centre.head_requested",
    target: centre.id,
    metadata: { centre: centre.name, head: head.name, request: created.id, note: parsed.data.note ?? null },
  });

  return NextResponse.json({
    ok: true,
    request: { id: created.id, status: "PENDING", head: { id: head.id, name: head.name }, createdAt: created.createdAt },
  });
});
