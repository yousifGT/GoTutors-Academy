import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { inspectionAccess } from "@/lib/inspection/access";

/**
 * The live checklist, in the order an inspector works through it.
 *
 * Anyone who may carry out or read an inspection may fetch it — the questions
 * are guidance, not data about a centre.
 */
export const GET = withRoute(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const access = await inspectionAccess(session.user.id);
  if (!access.conduct && !access.viewAll && !access.viewCentre)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const template = await prisma.inspectionTemplate.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: { questions: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!template)
    return NextResponse.json(
      { error: "No active checklist. Run: npm run db:seed:inspection" },
      { status: 404 }
    );

  return NextResponse.json(template);
});
