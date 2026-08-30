import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { parseJson, zPositionName } from "@/lib/validate";
import { collidingFieldName, tutorTitleFor } from "@/lib/sub-positions";
import { countFieldHolders, describeFieldHolders } from "@/lib/field-holders";

const RenameSchema = z.object({ name: zPositionName });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.roleType !== "SUPER_ADMIN")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, RenameSchema);
  if (!parsed.ok) return parsed.response;
  const newName = parsed.data.name;

  const existing = await prisma.subPosition.findUnique({ where: { id: params.id }, include: { role: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.name === newName) return NextResponse.json({ ok: true });

  // Conflict check
  const dupe = await prisma.subPosition.findUnique({
    where: { roleId_name: { roleId: existing.roleId, name: newName } },
  });
  if (dupe) return NextResponse.json({ error: "Another sub-position with that name already exists for this role" }, { status: 409 });

  // Two fields must never promote to the same tutor title — the stored title is
  // all a qualified tutor has, and it could then resolve back to either field.
  const allFields = (await prisma.subPosition.findMany({ select: { name: true } })).map((r) => r.name);
  const clash = collidingFieldName(newName, allFields.filter((n) => n !== existing.name));
  if (clash) {
    return NextResponse.json(
      { error: `"${newName}" and "${clash}" would both qualify people as "${tutorTitleFor(newName)}". Pick a name that doesn't collide.` },
      { status: 409 }
    );
  }

  // A rename that changes the tutor title has to carry teacherPositions with it.
  // promotion.ts is the ONLY writer of that column, so a title left behind can
  // never be repaired through the product: the field silently drops out of the
  // person's status, the retraining flag can never fire for it again, and new
  // courses published to the field never reach them — while their profile goes
  // on showing the badge.
  const oldTitle = tutorTitleFor(existing.name);
  const newTitle = tutorTitleFor(newName);
  const titleHolders =
    oldTitle === newTitle
      ? []
      : await prisma.user.findMany({
          where: { teacherPositions: { has: oldTitle } },
          select: { id: true, teacherPositions: true },
        });

  // Rename and cascade-update denormalized strings on User + CourseRoleAssignment.
  // Array entries can't be rewritten with updateMany, so rewrite each holder's
  // array individually inside the same transaction.
  const arrayHolders = await prisma.user.findMany({
    where: { subPositions: { has: existing.name } },
    select: { id: true, subPositions: true },
  });
  await prisma.$transaction([
    prisma.subPosition.update({ where: { id: existing.id }, data: { name: newName } }),
    prisma.user.updateMany({ where: { subPosition: existing.name }, data: { subPosition: newName } }),
    ...arrayHolders.map((u) =>
      prisma.user.update({
        where: { id: u.id },
        data: { subPositions: [...new Set(u.subPositions.map((n) => (n === existing.name ? newName : n)))] },
      })
    ),
    ...titleHolders.map((u) =>
      prisma.user.update({
        where: { id: u.id },
        data: { teacherPositions: [...new Set(u.teacherPositions.map((t) => (t === oldTitle ? newTitle : t)))] },
      })
    ),
    prisma.courseRoleAssignment.updateMany({
      where: { roleId: existing.roleId, subPosition: existing.name },
      data: { subPosition: newName },
    }),
  ]);

  await audit({
    actorId: session.user.id,
    action: "sub-position.rename",
    target: `sub-position:${existing.name} → ${newName}`,
    metadata: {
      role: existing.role.name,
      ...(titleHolders.length ? { retitledTutors: titleHolders.length } : {}),
    },
  });
  return NextResponse.json({ ok: true, retitledTutors: titleHolders.length });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.roleType !== "SUPER_ADMIN")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sp = await prisma.subPosition.findUnique({ where: { id: params.id }, include: { role: true } });
  if (!sp) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Counted by NAME across every role, and including the tutors who hold it as a
  // title. Scoping to the field's own role skipped precisely the people
  // promotion moves elsewhere, so a field could be deleted out from under its
  // tutors: their qualification stops resolving, and — because deleting also
  // drops the field's course requirements below — anyone left part-way through a
  // same-named field can read as fully trained and be auto-promoted without
  // finishing.
  const holders = await countFieldHolders(sp.name);
  if (holders.total > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete "${sp.name}": ${describeFieldHolders(holders)}. Move them off it first.`,
        ...holders,
      },
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
    target: `sub-position:${sp.name}`,
    metadata: { role: sp.role.name },
  });
  return NextResponse.json({ ok: true });
}
