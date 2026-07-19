import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CentresEditor } from "@/components/centres-editor";
import { PageHeader } from "@/components/page-ui";

export default async function CentresPage() {
  await requireRole("SUPER_ADMIN");
  const centres = await prisma.centre.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <div className="space-y-5">
      <PageHeader title="Centres" subtitle="The physical locations trainees belong to." />
      <CentresEditor
      centres={centres.map((c) => ({ id: c.id, name: c.name, location: c.location ?? "", users: c._count.users }))}
      />
    </div>
  );
}
