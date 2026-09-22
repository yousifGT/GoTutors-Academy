import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/session";
import { canEditScheme, schemeScope } from "@/lib/marking/access";
import { PageHeader, Callout } from "@/components/ui";
import { SchemeEditor } from "@/components/scheme-editor";
import { SchemeDangerZone } from "@/components/scheme-danger-zone";
import { percentageOf } from "@/lib/marking/scoring";

export const dynamic = "force-dynamic";

export default async function SchemePage({ params }: { params: { id: string } }) {
  const viewer = await requireViewer();

  const scheme = await prisma.markScheme.findFirst({
    where: { id: params.id, ...schemeScope(viewer) },
    include: {
      owner: { select: { name: true } },
      questions: { orderBy: { order: "asc" } },
      _count: { select: { submissions: true, examples: true } },
    },
  });
  if (!scheme) notFound();

  const editable = canEditScheme(viewer, scheme);

  // How often a person has had to change this scheme's marks. A high number
  // usually means the guidance is thin, not that the reader is bad — and that
  // is something the owner can actually fix.
  const [corrections, totalExamples] = await Promise.all([
    prisma.markingExample.count({ where: { markSchemeId: scheme.id, source: "HUMAN_CORRECTED" } }),
    prisma.markingExample.count({ where: { markSchemeId: scheme.id } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={scheme.title}
        subtitle={`${scheme.subject}${scheme.level ? ` · ${scheme.level}` : ""} · by ${scheme.owner.name}`}
        backHref="/schemes"
        backLabel="Mark schemes"
      />

      {scheme.archived && (
        <Callout>
          This scheme is archived, so it no longer appears when uploading a paper. Its {scheme._count.submissions} marked
          papers are untouched.
        </Callout>
      )}

      {totalExamples > 0 && (
        <div className="card text-sm">
          <strong>{totalExamples}</strong> marked answers have been kept from this scheme, of which{" "}
          <strong>{corrections}</strong> were corrections by a person ({percentageOf(corrections, totalExamples)}%). Every
          one of them is shown to the reader when it marks this paper again.
          {corrections > 0 && percentageOf(corrections, totalExamples) > 40 && (
            <div className="mt-2 text-[var(--muted)]">
              People are changing a lot of these marks. That usually means a question&apos;s guidance needs to say more
              about how part marks are awarded.
            </div>
          )}
        </div>
      )}

      {editable ? (
        <SchemeEditor
          schemeId={scheme.id}
          initial={{
            title: scheme.title,
            subject: scheme.subject,
            level: scheme.level ?? "",
            shared: scheme.shared,
            questions: scheme.questions.map((q) => ({
              label: q.label,
              prompt: q.prompt,
              expectedAnswer: q.expectedAnswer,
              marks: q.marks,
              guidance: q.guidance ?? "",
            })),
          }}
        />
      ) : (
        <div className="card p-0">
          <div className="border-b border-[var(--border)] px-5 py-3 text-sm font-bold">
            Questions — read only, because {scheme.owner.name} owns this scheme
          </div>
          <div className="divide-y divide-[var(--border)]">
            {scheme.questions.map((q) => (
              <div key={q.id} className="px-5 py-4">
                <div className="text-sm font-bold">
                  Q{q.label} <span className="font-normal text-[var(--muted)]">({q.marks} marks)</span>
                </div>
                <div className="mt-1 text-sm">{q.prompt}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">Expected: {q.expectedAnswer}</div>
                {q.guidance && <div className="mt-1 text-xs text-[var(--muted)]">{q.guidance}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {editable && !scheme.archived && (
        <SchemeDangerZone schemeId={scheme.id} paperCount={scheme._count.submissions} />
      )}
    </div>
  );
}
