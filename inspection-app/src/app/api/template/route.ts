import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { viewerOr401 } from "@/lib/session";

/** The live checklist, in the order an inspector works through it. */
export const GET = withRoute(async () => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const template = await prisma.template.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
    include: {
      sections: { orderBy: { order: "asc" }, include: { questions: { orderBy: { order: "asc" } } } },
    },
  });
  if (!template)
    return NextResponse.json({ error: "No active checklist. Run: npm run db:seed" }, { status: 404 });

  return NextResponse.json(template);
});
