import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
