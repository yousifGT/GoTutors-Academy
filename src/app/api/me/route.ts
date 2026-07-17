import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { parseJson } from "@/lib/validate";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  return NextResponse.json({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    roleType: session.user.roleType,
    centreId: session.user.centreId,
  });
}

// Self-service profile edits. Deliberately limited to the phone number —
// name/email/role/centre changes stay admin-only via /api/users/[id].
const UpdateMeSchema = z.object({
  phone: z.string().trim().max(30).nullable().optional(),
});

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const parsed = await parseJson(req, UpdateMeSchema);
  if (!parsed.ok) return parsed.response;

  const data: Record<string, unknown> = {};
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone || null;
  if (Object.keys(data).length > 0) {
    await prisma.user.update({ where: { id: session.user.id }, data });
  }
  return NextResponse.json({ ok: true });
}
