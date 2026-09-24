import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/session";
import { schemeScope, studentScope } from "@/lib/marking/access";
import { markingIsConfigured } from "@/lib/marking/marker";
import { PageHeader, Callout } from "@/components/ui";
import { PaperUploadForm } from "@/components/paper-upload-form";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const viewer = await requireViewer();

  const [students, schemes] = await Promise.all([
    prisma.student.findMany({
      where: { ...studentScope(viewer), active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, yearGroup: true, admissionNumber: true },
    }),
    prisma.markScheme.findMany({
      where: { ...schemeScope(viewer), archived: false },
      orderBy: { title: "asc" },
      select: { id: true, title: true, subject: true, _count: { select: { questions: true } } },
    }),
  ]);

  // A scheme with no questions cannot mark anything, so it is not offered —
  // picking it would fail at submit with an error the tutor can do nothing
  // about while standing next to the child.
  const usable = schemes.filter((s) => s._count.questions > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mark for a student"
        subtitle="Photograph the pages. The result is stored on that child's record straight away."
        backHref="/"
        backLabel="Dashboard"
      />

      {students.length === 0 && (
        <Callout>
          You have no students yet.{" "}
          <Link href="/students" className="underline">
            Add one
          </Link>{" "}
          before uploading a paper.
        </Callout>
      )}
      {usable.length === 0 && (
        <Callout>
          There is no mark scheme with any questions in it yet.{" "}
          <Link href="/schemes/new" className="underline">
            Write one
          </Link>
          .
        </Callout>
      )}

      <PaperUploadForm
        aiEnabled={markingIsConfigured()}
        students={students.map((s) => ({
          id: s.id,
          label: s.name,
          hint: [s.admissionNumber, s.yearGroup].filter(Boolean).join(" · "),
        }))}
        schemes={usable.map((s) => ({
          id: s.id,
          label: s.title,
          hint: `${s.subject}, ${s._count.questions} question${s._count.questions === 1 ? "" : "s"}`,
        }))}
      />
    </div>
  );
}
