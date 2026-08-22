import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { viewerOr401 } from "@/lib/session";
import { centreScope } from "@/lib/access";

/** The centres this viewer may work with, in display order. */
export const GET = withRoute(async () => {
  const who = await viewerOr401();
  if ("response" in who) return who.response;

  const centres = await prisma.centre.findMany({
    where: { ...centreScope(who.viewer), status: "OPEN" },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, address: true, size: true },
  });
  return NextResponse.json(centres);
});
