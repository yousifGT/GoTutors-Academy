import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.roleType !== "SUPER_ADMIN")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  const newName = name.trim();

  const existing = await prisma.subPosition.findUnique({ where: { id: params.id }, include: { role: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.name === newName) return NextResponse.json({ ok: true });

  // Conflict check
  const dupe = await prisma.subPosition.findUnique({
    where: { roleId_name: { roleId: existing.roleId, name: newName } },
  });
  if (dupe) return NextResponse.json({ error: "Another sub-position with that name already exists for this role" }, { status: 409 });

  // Rename and cascade-update denormalized strings on User + CourseRoleAssignment
  await prisma.$transaction([
    prisma.subPosition.update({ where: { id: existing.id }, data: { name: newName } }),
    prisma.user.updateMany({ where: { subPosition: existing.name }, data: { subPosition: newName } }),
    prisma.courseRoleAssignment.updateMany({
      where: { roleId: existing.roleId, subPosition: existing.name },
      data: { subPosition: newName },
    }),
  ]);

  await audit({
    actorId: session.user.id,
    action: "sub-position.rename",
    target: `${existing.role.name}:${existing.name} → ${newName}`,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.roleType !== "SUPER_ADMIN")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sp = await prisma.subPosition.findUnique({ where: { id: params.id }, include: { role: true } });
  if (!sp) return NextResponse.json({ error: "not found" }, { status: 404 });

  const userCount = await prisma.user.count({ where: { roleId: sp.roleId, subPosition: sp.name } });
  if (userCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${userCount} user(s) currently have this sub-position.`, userCount },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.courseRoleAssignment.deleteMany({ where: { roleId: sp.roleId, subPosition: sp.name } }),
    prisma.subPosition.delete({ where: { id: sp.id } }),
  ]);

  await audit({
    actorId: session.user.id,
    action: "sub-position.delete",
    target: `${sp.role.name}:${sp.name}`,
  });
  return NextResponse.json({ ok: true });
}
