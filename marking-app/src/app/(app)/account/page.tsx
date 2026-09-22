import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { PasswordForm } from "@/components/password-form";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const viewer = await requireViewer();
  const me = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { name: true, email: true, role: true, createdAt: true, organisation: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Your account" backHref="/" backLabel="Dashboard" />
      <div className="card space-y-1 text-sm">
        <div>
          <span className="text-[var(--muted)]">Name: </span>
          {me?.name}
        </div>
        <div>
          <span className="text-[var(--muted)]">Email: </span>
          {me?.email}
        </div>
        <div>
          <span className="text-[var(--muted)]">Centre: </span>
          {me?.organisation.name}
        </div>
        <div>
          <span className="text-[var(--muted)]">Role: </span>
          {me?.role === "ADMIN" ? "Admin" : "Marker"}
        </div>
        <div>
          <span className="text-[var(--muted)]">Joined: </span>
          {me ? formatDate(me.createdAt) : ""}
        </div>
      </div>
      <div className="card">
        <h3 className="font-bold">Change your password</h3>
        <PasswordForm />
      </div>
    </div>
  );
}
