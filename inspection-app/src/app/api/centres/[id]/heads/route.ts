import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canAssignCentreHead } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

const HeadsSchema = z.object({ headIds: z.array(z.string().min(1)).max(20) });

/**
 * Who runs this centre.
 *
 * Separate from `PATCH /api/centres/:id` on purpose. That route can rename a
 * centre, close it, change its size and set every kind of manager, and it is
 * for a super admin. This one does one thing, so a franchisee can be given it
 * without being given the rest: it accepts a list of heads of centre and
 * nothing else.
 *
 * The guarantees, which are what make it safe to delegate:
 *
 *   - only people who already have an account, so nobody here creates a login
 *     or sets a password;
 *   - only accounts whose role is already CENTRE_HEAD, so this cannot be used
 *     to hand out any access the person doing it does not have, and cannot
 *     promote anybody;
 *   - managers who are not heads of centre — the franchisee themselves, a
 *     regional manager — are preserved untouched, so a franchisee cannot remove
 *     themselves from their own centre by accident, or remove anybody above
 *     them on purpose.
 *
 * Everyone on the list receives the centre's reports, which is the point: a
 * franchisee who appoints a head of centre keeps getting them too.
 */
export const PUT = withRoute(async (req: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const centre = await prisma.centre.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, managers: { select: { id: true, name: true, role: true } } },
  });
  if (!centre) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!canAssignCentreHead(who.viewer, centre.managers.map((m) => m.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, HeadsSchema);
  if (!parsed.ok) return parsed.response;
  const wanted = Array.from(new Set(parsed.data.headIds));

  // Every id must be an active head of centre. Checked against the database
  // rather than trusted from the request: this is the whole of the promise that
  // the route cannot promote anybody.
  const heads = await prisma.user.findMany({
    where: { id: { in: wanted }, role: "CENTRE_HEAD", active: true },
    select: { id: true, name: true },
  });
  if (heads.length !== wanted.length)
    return NextResponse.json(
      { error: "Only people who already have an active head of centre account can be assigned." },
      { status: 400 }
    );

  // Keep everyone who is not a head of centre exactly as they were.
  const others = centre.managers.filter((m) => m.role !== "CENTRE_HEAD");
  const updated = await prisma.centre.update({
    where: { id: centre.id },
    data: { managers: { set: [...others.map((m) => ({ id: m.id })), ...heads.map((h) => ({ id: h.id }))] } },
    select: { managers: { select: { id: true, name: true, role: true, email: true } } },
  });

  const before = centre.managers.filter((m) => m.role === "CENTRE_HEAD").map((m) => m.name);
  await audit({
    actorId: who.viewer.id,
    action: "centre.heads",
    target: centre.id,
    metadata: {
      centre: centre.name,
      was: before.join(", ") || "nobody",
      now: heads.map((h) => h.name).join(", ") || "nobody",
    },
  });

  return NextResponse.json({ ok: true, managers: updated.managers });
});
