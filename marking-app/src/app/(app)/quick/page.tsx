import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/session";
import { schemeScope } from "@/lib/marking/access";
import { markingIsConfigured } from "@/lib/marking/marker";
import { PageHeader, Callout } from "@/components/ui";
import { QuickMarkForm } from "@/components/quick-mark-form";

export const dynamic = "force-dynamic";

export default async function QuickMarkPage() {
  const viewer = await requireViewer();

  const schemes = await prisma.markScheme.findMany({
    where: { ...schemeScope(viewer), archived: false },
    orderBy: { title: "asc" },
    select: { id: true, title: true, subject: true, _count: { select: { questions: true } } },
  });
  const usable = schemes.filter((s) => s._count.questions > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quick marking"
        subtitle="Work through a pile of papers against one scheme. Decide what to keep at the end."
        backHref="/"
        backLabel="Dashboard"
        actions={
          <Link href="/upload" className="btn-ghost text-sm">
            Mark for one student
          </Link>
        }
      />

      {usable.length === 0 && (
        <Callout>
          There is no mark scheme with any questions in it yet.{" "}
          <Link href="/schemes/new" className="underline">
            Write one
          </Link>
          .
        </Callout>
      )}

      <QuickMarkForm
        aiEnabled={markingIsConfigured()}
        schemes={usable.map((s) => ({
          id: s.id,
          label: s.title,
          hint: `${s.subject}, ${s._count.questions} question${s._count.questions === 1 ? "" : "s"}`,
        }))}
      />
    </div>
  );
}
