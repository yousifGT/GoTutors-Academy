import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canManageCentres } from "@/lib/access";
import { CentreManager } from "./centre-manager";

export default async function CentresPage() {
  const user = await requireUser();
  if (!canManageCentres(user.role)) redirect("/");

  const centres = await prisma.centre.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      address: true,
      size: true,
      status: true,
      sortOrder: true,
      _count: { select: { inspections: true } },
    },
  });
  return <CentreManager initial={centres} />;
}
