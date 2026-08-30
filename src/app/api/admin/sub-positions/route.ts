import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { parseJson, zId, zPositionName } from "@/lib/validate";
import { collidingFieldName, tutorTitleFor } from "@/lib/sub-positions";

const SubPositionSchema = z.object({ roleId: zId, name: zPositionName });

export async function POST(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.roleType !== "SUPER_ADMIN")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, SubPositionSchema);
  if (!parsed.ok) return parsed.response;
  const { roleId, name } = parsed.data;

  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true } });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  // Two fields must never promote to the same tutor title: teacherPositions
  // stores only the title, so it would resolve back to either field and the
  // person's requirements would be read from the wrong course set.
  const allFields = (await prisma.subPosition.findMany({ select: { name: true } })).map((r) => r.name);
  const clash = collidingFieldName(name, allFields);
  if (clash) {
    return NextResponse.json(
      { error: `"${name}" and "${clash}" would both qualify people as "${tutorTitleFor(name)}". Pick a name that doesn't collide.` },
      { status: 409 }
    );
  }

  try {
    const sp = await prisma.subPosition.create({ data: { roleId, name } });
    await audit({
      actorId: session.user.id,
      action: "sub-position.create",
      // Same `kind:value` shape as every other target, with the role in metadata
      // rather than concatenated into the string.
      target: `sub-position:${sp.name}`,
      metadata: { role: role.name },
    });
    return NextResponse.json({ id: sp.id });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Sub-position with that name already exists for this role" }, { status: 409 });
    throw e;
  }
}
