import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canAssignCentreHead, canDecideHeadRequest, canRequestCentreHead, readsWholeCentre } from "@/lib/access";
import { progressFor, trend, type Visit } from "@/lib/progress";
import { CentreDashboard } from "./dashboard";

/**
 * One centre, over time.
 *
 * The report answers "how was this visit". This answers the question the person
 * running the centre actually has, which is whether it is getting better — and
 * in particular what they were told about last time that is now put right,
 * which nothing anywhere was working out.
 */
export default async function CentrePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  const viewer = { id: user.id, role: user.role };

  const centre = await prisma.centre.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      address: true,
      size: true,
      status: true,
      managers: { select: { id: true, name: true, email: true, role: true } },
    },
  });
  if (!centre) notFound();
  if (!readsWholeCentre(viewer, centre.managers.map((m) => m.id))) redirect("/reports");

  const managerIds = centre.managers.map((m) => m.id);
  const mayAssign = canAssignCentreHead(viewer);
  const mayDecide = canDecideHeadRequest(viewer.role);
  const mayRequest = canRequestCentreHead(viewer, managerIds);

  // Everyone who could be made a head of this centre: an existing, active head
  // of centre account. Nothing here creates one. Loaded for whoever can name
  // somebody — the admin who assigns, or the franchisee who asks.
  const candidates =
    mayAssign || mayRequest
      ? await prisma.user.findMany({
          where: { role: "CENTRE_HEAD", active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true, role: true },
        })
      : [];

  // Requests are shown to the people they concern: whoever can answer one, and
  // whoever raised it. Answered requests stay visible to the asker so a
  // rejection is not silent.
  const requestRows =
    mayDecide || mayAssign || mayRequest
      ? await prisma.centreHeadRequest.findMany({
          where: { centreId: centre.id },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: 50,
          select: {
            id: true,
            status: true,
            note: true,
            decisionNote: true,
            createdAt: true,
            askedById: true,
            head: { select: { id: true, name: true, email: true } },
            askedBy: { select: { name: true } },
          },
        })
      : [];
  const requests = requestRows.map((r) => ({
    id: r.id,
    status: r.status,
    note: r.note,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt.toISOString(),
    head: r.head,
    askedBy: r.askedBy,
    mine: r.askedById === viewer.id,
  }));

  const rows = await prisma.inspection.findMany({
    where: { centreId: centre.id, status: "SUBMITTED" },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      date: true,
      scorePct: true,
      verdict: true,
      activeMs: true,
      inspector: { select: { name: true } },
      answers: { select: { questionText: true, bucket: true, question: { select: { critical: true } } } },
    },
  });

  const visits: Visit[] = rows.map((r) => ({
    id: r.id,
    date: r.date,
    scorePct: r.scorePct,
    verdict: r.verdict,
    inspector: r.inspector.name,
    answers: r.answers.map((a) => ({
      questionText: a.questionText,
      bucket: a.bucket,
      critical: a.question.critical,
    })),
  }));

  return (
    <CentreDashboard
      centre={{ id: centre.id, name: centre.name, address: centre.address, size: centre.size, status: centre.status }}
      progress={progressFor(visits)}
      points={trend(visits)}
      durations={Object.fromEntries(rows.map((r) => [r.id, r.activeMs]))}
      people={{ managers: centre.managers, candidates, mayAssign, mayDecide, mayRequest, requests }}
    />
  );
}
