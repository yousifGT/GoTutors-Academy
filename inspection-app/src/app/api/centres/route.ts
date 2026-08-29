import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { parseJson, zName } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canManageCentres, centreScope } from "@/lib/access";

const CentreSchema = z.object({
  name: zName,
  address: z.string().max(300).nullish(),
  size: z.enum(["SMALL", "MEDIUM", "LARGE"]).nullish(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

/**
 * The centres this viewer may work with, in display order.
 *
 * Closed centres are left out by default — an inspector picking a centre should
 * not see sites that no longer run. `?all=1` includes them, for the management
 * screen.
 */
export const GET = withRoute(async (req: Request) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const all = new URL(req.url).searchParams.get("all") === "1";
  const centres = await prisma.centre.findMany({
    where: { ...centreScope(who.viewer), ...(all ? {} : { status: "OPEN" }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      address: true,
      size: true,
      status: true,
      sortOrder: true,
      _count: { select: { inspections: true } },
    },
  });
  return NextResponse.json(centres);
});

export const POST = withRoute(async (req: Request) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canManageCentres(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, CentreSchema);
  if (!parsed.ok) return parsed.response;
  const { name, address, size, status, sortOrder } = parsed.data;

  const centre = await prisma.centre.create({
    data: {
      name,
      address: address ?? null,
      size: size ?? null,
      status: status ?? "OPEN",
      sortOrder: sortOrder ?? 0,
    },
  });
  await audit({ actorId: who.viewer.id, action: "centre.create", target: centre.id, metadata: { name } });
  return NextResponse.json(centre, { status: 201 });
});
