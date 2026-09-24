import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";
import { submissionScope } from "@/lib/marking/access";
import { EXPORTABLE } from "@/lib/marking/view";
import { loadReportPapers } from "@/lib/marking/report-data";
import { renderReport, reportFilename } from "@/lib/marking/report-pdf";

/** One PDF for everything marked in a single quick-marking session. */
// Reads the session, so it must never be treated as a static route.
export const dynamic = "force-dynamic";

export const GET = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const where = { batchId: params.id, ...submissionScope(viewer) };
  const [count, organisation] = await Promise.all([
    prisma.submission.count({ where: { ...where, status: { in: EXPORTABLE } } }),
    prisma.organisation.findUnique({ where: { id: viewer.organisationId }, select: { name: true } }),
  ]);
  if (count === 0) {
    return NextResponse.json(
      { error: "Nothing here is ready to export yet — the papers still need marking or checking." },
      { status: 409 }
    );
  }

  // Only the papers that are actually finished; a half-marked pile still
  // produces a report for the part of it that is done.
  const papers = await loadReportPapers({ ...where, status: { in: EXPORTABLE } });
  const pdf = await renderReport(papers, organisation?.name ?? "");

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${reportFilename(papers)}"`,
      "cache-control": "no-store",
    },
  });
});
