import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canManageCentres, canManageUsers } from "@/lib/access";
import { canReadAudit } from "@/lib/audit-view";
import { Wordmark } from "@/components/brand";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!canManageUsers(user.role) && !canManageCentres(user.role) && !canReadAudit(user.role)) redirect("/");

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="flex items-center justify-between">
        <Link href="/">
          <Wordmark className="text-lg" />
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link href="/" className="text-sky-600">
            Inspections
          </Link>
          {canManageUsers(user.role) && (
            <Link href="/admin/users" className="font-medium text-navy">
              People
            </Link>
          )}
          {canManageCentres(user.role) && (
            <Link href="/admin/centres" className="font-medium text-navy">
              Centres
            </Link>
          )}
          {canReadAudit(user.role) && (
            <Link href="/admin/audit" className="font-medium text-navy">
              Activity
            </Link>
          )}
        </nav>
      </header>
      {children}
    </div>
  );
}
