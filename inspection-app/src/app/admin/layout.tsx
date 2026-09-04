import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canDecideHeadRequest, canManageCentres, canManageTemplate, canManageUsers } from "@/lib/access";
import { canReadAudit } from "@/lib/audit-view";
import { Wordmark } from "@/components/brand";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (
    !canManageUsers(user.role) &&
    !canManageCentres(user.role) &&
    !canManageTemplate(user.role) &&
    !canReadAudit(user.role)
  )
    redirect("/");

  // A request nobody notices is a request nobody answers, so the count is on
  // the nav rather than only on the page it links to.
  const waiting = canDecideHeadRequest(user.role)
    ? await prisma.centreHeadRequest.count({ where: { status: "PENDING" } })
    : 0;

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
          {canManageTemplate(user.role) && (
            <Link href="/admin/checklist" className="font-medium text-navy">
              Checklist
            </Link>
          )}
          {canDecideHeadRequest(user.role) && (
            <Link href="/admin/head-requests" className="font-medium text-navy">
              Requests
              {waiting > 0 && (
                <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  {waiting}
                </span>
              )}
            </Link>
          )}
          {canManageUsers(user.role) && (
            <Link href="/admin/email" className="font-medium text-navy">
              Email
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
