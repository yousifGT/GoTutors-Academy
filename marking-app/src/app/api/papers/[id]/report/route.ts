import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";
import { submissionScope } from "@/lib/marking/access";
import { canExport } from "@/lib/marking/view";
import { loadReportPapers } from "@/lib/marking/report-data";
import { renderReport, reportFilename } from "@/lib/marking/report-pdf";

/** The PDF a centre emails to a parent. */
// Reads the session, so it must never be treated as a static route.
export const dynamic = "force-dynamic";

export const GET = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const submission = await prisma.submission.findFirst({
    where: { id: params.id, ...submissionScope(viewer) },
    select: { id: true, status: true, organisation: { select: { name: true } } },
  });
  if (!submission) return NextResponse.json({ error: "not found" }, { status: 404 });
  // A report for a paper with no marks would be a page of zeroes with a
  // centre's name at the top; a report for one that still needs checking would
  // send a parent a mark nobody trusts. Neither is worth producing.
  if (!canExport(submission.status)) {
    return NextResponse.json(
      {
        error:
          submission.status === "NEEDS_HUMAN" || submission.status === "FAILED"
            ? "Check this paper first — part of it has not been marked with confidence."
            : "This paper has not been marked yet.",
      },
      { status: 409 }
    );
  }

  const papers = await loadReportPapers({ id: submission.id });
  const pdf = await renderReport(papers, submission.organisation.name);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${reportFilename(papers)}"`,
      // Marks change when a person corrects them, so never let a proxy or a
      // browser serve yesterday's report.
      "cache-control": "no-store",
    },
  });
});
