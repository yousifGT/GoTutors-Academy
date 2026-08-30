import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canEditInspection, inspectionScope } from "@/lib/access";
import { previouslyFlaggedAt } from "@/lib/previous";
import { Runner } from "./runner";

export default async function InspectionPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const viewer = { id: user.id, role: user.role };

  // Scoped read: an inspection outside this viewer's reach is simply not found.
  const inspection = await prisma.inspection.findFirst({
    where: { AND: [{ id: params.id }, inspectionScope(viewer)] },
    include: {
      centre: { select: { id: true, name: true } },
      inspector: { select: { id: true, name: true } },
      template: {
        include: {
          sections: { orderBy: { order: "asc" }, include: { questions: { orderBy: { order: "asc" } } } },
        },
      },
      answers: { include: { entries: { orderBy: { order: "asc" }, include: { photos: true } } } },
    },
  });
  if (!inspection) notFound();

  // A submitted inspection is a record; it is read at /report, not here.
  if (!canEditInspection(viewer, inspection)) redirect(`/inspections/${inspection.id}/report`);

  // What the last visit flagged, so the inspector knows where to look before
  // they answer rather than finding out when the report is written.
  const previouslyFlagged = await previouslyFlaggedAt(inspection.centreId, inspection.id);

  return (
    <Runner
      id={inspection.id}
      centreName={inspection.centre.name}
      size={inspection.size}
      date={inspection.date.toISOString().slice(0, 10)}
      activeMs={inspection.activeMs}
      updatedAt={inspection.updatedAt.toISOString()}
      previouslyFlagged={Array.from(previouslyFlagged)}
      sections={inspection.template.sections.map((s) => ({ title: s.title, questions: s.questions }))}
      saved={inspection.answers.map((a) => ({
        questionId: a.questionId,
        answer: a.answer,
        entries: a.entries.map((e) => ({
          note: e.note ?? "",
          who: e.who ?? "",
          photos: e.photos.map((p) => p.url),
        })),
      }))}
      debrief={{
        role: inspection.debriefRole ?? "",
        name: inspection.debriefName ?? "",
        notes: inspection.debriefNotes ?? "",
        feedback: inspection.debriefFeedback ?? "",
        email: inspection.debriefEmail ?? "",
      }}
      targets={inspection.targets ?? ""}
    />
  );
}
