import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export default async function AdminDashboard() {
  await requireRole("SUPER_ADMIN");
  const [centres, users, courses, certs] = await Promise.all([
    prisma.centre.count(),
    prisma.user.count(),
    prisma.course.count(),
    prisma.certificate.count(),
  ]);
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <div className="gt-card p-5"><div className="text-xs uppercase text-[var(--muted)]">Centres</div><div className="mt-2 text-3xl font-bold">{centres}</div></div>
      <div className="gt-card p-5"><div className="text-xs uppercase text-[var(--muted)]">Users</div><div className="mt-2 text-3xl font-bold text-picton">{users}</div></div>
      <div className="gt-card p-5"><div className="text-xs uppercase text-[var(--muted)]">Courses</div><div className="mt-2 text-3xl font-bold text-magenta">{courses}</div></div>
      <div className="gt-card p-5"><div className="text-xs uppercase text-[var(--muted)]">Certificates issued</div><div className="mt-2 text-3xl font-bold text-mint">{certs}</div></div>
    </div>
  );
}
