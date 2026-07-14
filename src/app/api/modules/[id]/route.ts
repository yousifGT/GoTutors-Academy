import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { requireModuleAccess } from "@/lib/course-access";
import { z } from "zod";
import { parseJson } from "@/lib/validate";

const ModulePatchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  order: z.number().int().min(0).optional(),
});

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_DELETE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const denied = await requireModuleAccess(session.user, params.id);
  if (denied) return denied;
  await prisma.module.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.COURSE_EDIT)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const denied = await requireModuleAccess(session.user, params.id);
  if (denied) return denied;

  const parsed = await parseJson(req, ModulePatchSchema);
  if (!parsed.ok) return parsed.response;

  const m = await prisma.module.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(m);
}
