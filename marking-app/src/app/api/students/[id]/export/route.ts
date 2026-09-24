import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";
import { studentScope } from "@/lib/marking/access";
import { hasScore } from "@/lib/marking/view";
import { percentageOf } from "@/lib/marking/scoring";
import { bandFor } from "@/lib/marking/feedback";
import { toCsv } from "@/lib/csv";

/**
 * One child's results as a spreadsheet — for a progress meeting, or to hand
 * over when they move centre.
 */
// Reads the session, so it must never be treated as a static route.
export const dynamic = "force-dynamic";

export const GET = withRoute(async (req: Request, { params }: { params: { id: string } }) => {
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const student = await prisma.student.findFirst({
    where: { id: params.id, ...studentScope(viewer) },
    include: {
      submissions: {
        orderBy: { createdAt: "asc" },
        include: { markScheme: { select: { title: true, subject: true } } },
      },
    },
  });
  if (!student) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows: (string | number | null)[][] = [
    ["Date", "Paper", "Subject", "Awarded", "Available", "Percentage", "Band", "Status", "What to work on"],
  ];
  for (const s of student.submissions) {
    const scored = hasScore(s.status) && (s.available ?? 0) > 0;
    const pct = scored ? percentageOf(s.awarded ?? 0, s.available ?? 0) : null;
    rows.push([
      (s.markedAt ?? s.createdAt).toISOString().slice(0, 10),
      s.markScheme.title,
      s.markScheme.subject,
      scored ? s.awarded : null,
      scored ? s.available : null,
      pct,
      pct === null ? null : bandFor(pct).label,
      s.status,
      s.improvements.join(" · "),
    ]);
  }

  const filename = `${student.admissionNumber}-${student.name}`.replace(/[^\w\-]+/g, "-");
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}-results.csv"`,
      "cache-control": "no-store",
    },
  });
});
