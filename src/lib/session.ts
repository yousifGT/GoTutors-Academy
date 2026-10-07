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

/**
 * Who may take a course: everyone. Any role can be assigned one — a super
 * admin's course for the heads of centre is the case that made this a list
 * rather than "trainees" — so the course, lesson and certificate pages admit
 * all of these. Access to a particular course is still decided by enrolment.
 */
export const LEARNER_ROLES: RoleType[] = ["TRAINEE", "INSTRUCTOR", "CENTRE_ADMIN", "SUPER_ADMIN"];
