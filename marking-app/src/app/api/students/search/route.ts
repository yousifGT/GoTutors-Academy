import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { viewerOrNull } from "@/lib/session";
import { studentScope } from "@/lib/marking/access";
import { rankStudents, studentSearchFilter } from "@/lib/marking/student-search";

/**
 * The lookup behind "who does this paper belong to?".
 *
 * Read-only and scoped like every other student query, so the picker in quick
 * marking can never surface a child from another centre — or, for a marker,
 * from a colleague's list.
 */
// Reads the session, so it must never be treated as a static route.
export const dynamic = "force-dynamic";

export const GET = withRoute(async (req: Request) => {
  const viewer = await viewerOrNull();
  if (!viewer) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const query = new URL(req.url).searchParams.get("q") ?? "";
  const students = await prisma.student.findMany({
    where: { ...studentScope(viewer), active: true, ...studentSearchFilter(query) },
    orderBy: { name: "asc" },
    take: 20,
    select: { id: true, name: true, admissionNumber: true, yearGroup: true },
  });

  return NextResponse.json({ students: rankStudents(students, query) });
});
