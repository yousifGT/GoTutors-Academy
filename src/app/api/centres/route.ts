import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { z } from "zod";
import { parseJson, zName } from "@/lib/validate";
import { duplicateOf } from "@/lib/names";

const CentreSchema = z.object({
  name: zName,
  location: z.string().max(200).nullish(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.CENTRE_MANAGE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, CentreSchema);
  if (!parsed.ok) return parsed.response;
  const { name, location } = parsed.data;

  // Same rule as renaming (PATCH /api/centres/[id]).
  const clash = duplicateOf(name, await prisma.centre.findMany({ select: { id: true, name: true } }));
  if (clash) return NextResponse.json({ error: `A centre called "${clash.name}" already exists.` }, { status: 409 });

  const c = await prisma.centre.create({ data: { name, location: location || null } });
  return NextResponse.json(c);
}
