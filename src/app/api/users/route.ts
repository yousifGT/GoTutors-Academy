import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, userHasPermission } from "@/lib/permissions";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userHasPermission(session.user.id, PERMISSIONS.USER_CREATE)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, email, password, position, subPosition, roleId, centreId } = body;
  if (!name || !email || !password || !roleId) return NextResponse.json({ error: "missing fields" }, { status: 400 });
  if (subPosition) {
    const exists = await prisma.subPosition.findFirst({ where: { roleId, name: subPosition }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Sub-position does not exist for this role" }, { status: 400 });
  }

  // centre admins can only create users in their own centre
  let finalCentreId: string | null = centreId ?? null;
  if (session.user.roleType === "CENTRE_ADMIN") {
    finalCentreId = session.user.centreId;
  }

  const hashed = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashed,
        position: position || null,
        subPosition: subPosition || null,
        roleId,
        centreId: finalCentreId,
      },
    });
    return NextResponse.json({ id: user.id });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    return NextResponse.json({ error: "Could not create user" }, { status: 500 });
  }
}
