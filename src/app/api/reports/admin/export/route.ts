import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { csvResponse, toCsv } from "@/lib/csv";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (session.user.roleType !== "SUPER_ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const centres = await prisma.centre.findMany({
    include: {
      users: {
        select: {
          id: true,
          enrollments: { select: { id: true, completed: true } },
          quizAttempts: { select: { passed: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = centres.map((c) => {
    const enrolments = c.users.flatMap((u) => u.enrollments);
    const attempts = c.users.flatMap((u) => u.quizAttempts);
    const completed = enrolments.filter((e) => e.completed).length;
    const passes = attempts.filter((a) => a.passed).length;
    const fails = attempts.length - passes;
    return {
      centre: c.name,
      users: c.users.length,
      enrolments: enrolments.length,
      completed,
      passes,
      fails,
      pass_rate: attempts.length ? Math.round((passes / attempts.length) * 100) : 0,
    };
  });

  return csvResponse("global-report.csv", toCsv(rows));
}
