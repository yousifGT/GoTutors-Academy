import { prisma } from "@/lib/prisma";

export type CentreReportRow = {
  id: string;
  name: string;
  users: number;
  enrolments: number;
  completed: number;
  passes: number;
  fails: number;
  passRate: number;
};

/**
 * Per-centre report stats computed with DB-side COUNTs, bounded by the number of
 * centres (a handful) rather than the total number of enrolments/attempts. The
 * previous approach loaded every enrolment and quiz attempt system-wide into
 * memory, which grows without limit and eventually OOMs / times out.
 */
export async function centreReportRows(): Promise<CentreReportRow[]> {
  const centres = await prisma.centre.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  return Promise.all(
    centres.map(async (c) => {
      const userWhere = { centreId: c.id };
      const [users, enrolments, completed, attempts, passes] = await Promise.all([
        prisma.user.count({ where: userWhere }),
        prisma.enrollment.count({ where: { user: userWhere } }),
        prisma.enrollment.count({ where: { user: userWhere, completed: true } }),
        prisma.quizAttempt.count({ where: { user: userWhere } }),
        prisma.quizAttempt.count({ where: { user: userWhere, passed: true } }),
      ]);
      return {
        id: c.id,
        name: c.name,
        users,
        enrolments,
        completed,
        passes,
        fails: attempts - passes,
        passRate: attempts ? Math.round((passes / attempts) * 100) : 0,
      };
    })
  );
}
