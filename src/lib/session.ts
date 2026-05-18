import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { RoleType } from "@prisma/client";
import { authOptions, roleDashboard } from "@/lib/auth";

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return session;
}

export async function requireRole(...allowed: RoleType[]) {
  const session = await requireSession();
  if (!allowed.includes(session.user.roleType)) {
    redirect(roleDashboard[session.user.roleType]);
  }
  return session;
}
