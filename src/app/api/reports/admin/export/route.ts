import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { centreReportRows } from "@/lib/centre-report";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (session.user.roleType !== "SUPER_ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = (await centreReportRows()).map((r) => ({
    centre: r.name,
    users: r.users,
    enrolments: r.enrolments,
    completed: r.completed,
    passes: r.passes,
    fails: r.fails,
    pass_rate: r.passRate,
  }));

  return csvResponse("global-report.csv", toCsv(rows));
}
