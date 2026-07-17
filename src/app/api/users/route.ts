import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";
import { z } from "zod";
import { parseJson, zId, zName, zEmail, zPassword } from "@/lib/validate";
import { syncUserEnrollments } from "@/lib/auto-enrol";

const CreateUserSchema = z.object({
  name: zName,
  email: zEmail,
  password: zPassword,
  phone: z.string().trim().max(30).nullish(),
  position: z.string().max(200).nullish(),
  subPosition: z.string().max(200).nullish(),
  subPositions: z.array(z.string().max(200)).max(50).optional(),
  roleId: zId,
  centreId: zId.nullish(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.USER_CREATE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await parseJson(req, CreateUserSchema);
  if (!parsed.ok) return parsed.response;
  const { name, email, password, position, subPosition, roleId, centreId } = parsed.data;
  // Accept both shapes: the multi-select form sends subPositions[]; older
  // clients may still send the single subPosition.
  const subs = [...new Set(parsed.data.subPositions ?? (subPosition ? [subPosition] : []))];

  // Privilege-escalation guard: a non-super-admin (e.g. centre admin) may only
  // create trainee accounts. Without this, anyone with USER_CREATE could pass
  // an admin/instructor roleId and mint a privileged account.
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { type: true } });
  if (!role) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  if (session.user.roleType !== "SUPER_ADMIN" && role.type !== "TRAINEE") {
    return NextResponse.json({ error: "You may only create trainee accounts" }, { status: 403 });
  }

  if (subs.length > 0) {
    const found = await prisma.subPosition.count({ where: { roleId, name: { in: subs } } });
    if (found !== subs.length)
      return NextResponse.json({ error: "Sub-position does not exist for this role" }, { status: 400 });
  }

  // centre admins can only create users in their own centre
  let finalCentreId: string | null = centreId ?? null;
  if (session.user.roleType === "CENTRE_ADMIN") {
    finalCentreId = session.user.centreId;
  }

  const hashed = await bcrypt.hash(password, 12);
  try {
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashed,
        phone: parsed.data.phone || null,
        position: position || null,
        subPosition: subs[0] ?? null,
        subPositions: subs,
        roleId,
        centreId: finalCentreId,
      },
    });
    // New trainees receive every published course matching their sub-positions.
    await syncUserEnrollments(user.id);
    return NextResponse.json({ id: user.id });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    return NextResponse.json({ error: "Could not create user" }, { status: 500 });
  }
}
