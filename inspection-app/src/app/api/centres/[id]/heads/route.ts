import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canAssignCentreHead } from "@/lib/access";
import { setCentreHeads, nameList } from "@/lib/head-request";

type Ctx = { params: Promise<{ id: string }> };

const HeadsSchema = z.object({ headIds: z.array(z.string().min(1)).max(20) });

/**
 * Who runs this centre — set directly.
 *
 * Separate from `PATCH /api/centres/:id` on purpose. That route can rename a
 * centre, close it, change its size and set every kind of manager. This one
 * accepts a list of heads of centre and nothing else, and so can be reasoned
 * about on its own.
 *
 * For the people who administer centres. A franchisee cannot reach it: they ask
 * instead, through `POST /api/centres/:id/head-requests`, and a super admin
 * answers. The guarantees the change rests on are in `setCentreHeads`.
 */
export const PUT = withRoute(async (req: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  if (!canAssignCentreHead(who.viewer))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, HeadsSchema);
  if (!parsed.ok) return parsed.response;

  const result = await setCentreHeads(params.id, parsed.data.headIds);
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: result.error === "not found" ? 404 : 400 });

  const centre = await prisma.centre.findUnique({ where: { id: params.id }, select: { name: true } });
  await audit({
    actorId: who.viewer.id,
    action: "centre.heads",
    target: params.id,
    metadata: { centre: centre?.name, was: nameList(result.was), now: nameList(result.now) },
  });

  return NextResponse.json({ ok: true, managers: result.managers });
});
