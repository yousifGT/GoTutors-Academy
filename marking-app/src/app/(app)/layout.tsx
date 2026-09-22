import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/lib/session";
import { navFor } from "@/lib/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const [organisation, nav] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: viewer.organisationId }, select: { name: true } }),
    navFor(viewer),
  ]);

  return (
    <AppShell
      user={{ name: viewer.name, email: viewer.email, role: viewer.role, organisation: organisation?.name ?? "" }}
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
