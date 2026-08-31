import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canManageUsers } from "@/lib/access";
import { PeopleManager } from "./people-manager";

export default async function UsersPage() {
  const user = await requireUser();
  if (!canManageUsers(user.role)) redirect("/");

  const [users, centres] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        lastLoginAt: true,
        centres: { select: { id: true, name: true } },
        assignedCentres: { select: { id: true, name: true } },
        // What deleting them would take with them — see the DELETE handler.
        _count: { select: { inspections: true, deliveries: true, visits: true, uploads: true } },
      },
    }),
    prisma.centre.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <PeopleManager
      me={user.id}
      initial={users.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))}
      centres={centres}
    />
  );
}
