import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { viewerOr401 } from "@/lib/session";
import { inspectionScope } from "@/lib/access";
import { buildReport, reportInclude } from "@/lib/report";
import { loadPhotos, photoUrls } from "@/lib/report-photos";
import { renderReportPdf, reportFilename } from "@/lib/report-pdf";
import { audit } from "@/lib/audit";

type Ctx = { params: { id: string } };

/**
 * The inspection report as a PDF.
 *
 * Rendered from the same `Report` the screen shows, so the document that leaves
 * the building says exactly what the inspector saw. A draft renders too, marked
 * as one, because a supervisor sometimes needs the findings before the visit is
 * formally closed.
 *
 * Downloading a report is worth recording: it is the moment findings about a
 * centre leave the system.
 */
export const GET = withRoute(async (req: Request, { params }: Ctx) => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const inspection = await prisma.inspection.findFirst({
    where: { AND: [{ id: params.id }, inspectionScope(who.viewer)] },
    include: reportInclude,
  });
  if (!inspection) return NextResponse.json({ error: "not found" }, { status: 404 });

  const report = buildReport(inspection);
  const photos = await loadPhotos(photoUrls(report));
  const pdf = await renderReportPdf(report, photos);

  await audit({
    actorId: who.viewer.id,
    action: "inspection.pdf",
    target: inspection.id,
    metadata: { centre: report.centre, pct: report.pct },
  });

  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(pdf.length),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${reportFilename(report)}"`,
      // A report is about one centre and is not public; never let a proxy keep it.
      "cache-control": "private, no-store",
    },
  });
});
