import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canManageTemplate } from "@/lib/access";
import { questionFromDb, type Checklist } from "@/lib/checklist";
import { ChecklistEditor } from "./checklist-editor";

export default async function ChecklistPage() {
  const user = await requireUser();
  if (!canManageTemplate(user.role)) redirect("/");

  const live = await prisma.template.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
    select: {
      id: true,
      name: true,
      version: true,
      _count: { select: { inspections: true } },
      sections: {
        orderBy: { order: "asc" },
        select: {
          title: true,
          questions: {
            orderBy: { order: "asc" },
            select: {
              text: true,
              type: true,
              options: true,
              minVal: true,
              maxVal: true,
              unit: true,
              scored: true,
              requireNote: true,
              critical: true,
              photoExempt: true,
              allowNA: true,
              whoField: true,
              guide: true,
              dos: true,
              donts: true,
              sizeGuide: true,
              minBySize: true,
              tallyKey: true,
            },
          },
        },
      },
    },
  });

  if (!live) {
    return (
      <main className="mt-6">
        <h1 className="text-2xl font-bold text-navy">Checklist</h1>
        <p className="mt-4 rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-200">
          There is no checklist in the database yet. Import the starting one with{" "}
          <code className="rounded bg-white px-1.5 py-0.5 ring-1 ring-amber-200">npm run db:seed</code>, then edit it
          here.
        </p>
      </main>
    );
  }

  // Drafts are counted separately because they are the ones a change affects
  // while someone is standing in a centre with the app open. They finish on the
  // version they started with; the editor says so rather than leaving it to be
  // discovered.
  const [drafts, history] = await Promise.all([
    prisma.inspection.count({ where: { templateId: live.id, status: "DRAFT" } }),
    prisma.template.findMany({
      where: { name: live.name },
      orderBy: { version: "desc" },
      select: { id: true, version: true, isActive: true, createdAt: true, _count: { select: { inspections: true } } },
    }),
  ]);

  const checklist: Checklist = {
    sections: live.sections.map((s) => ({ title: s.title, questions: s.questions.map(questionFromDb) })),
  };

  return (
    <ChecklistEditor
      initial={checklist}
      version={live.version}
      name={live.name}
      inspections={live._count.inspections}
      drafts={drafts}
      history={history.map((h) => ({
        version: h.version,
        isActive: h.isActive,
        createdAt: h.createdAt.toISOString(),
        inspections: h._count.inspections,
      }))}
    />
  );
}
