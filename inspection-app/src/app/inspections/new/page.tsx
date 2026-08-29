import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canConduct, centreScope } from "@/lib/access";
import { StartForm } from "./start-form";

export default async function NewInspectionPage({
  searchParams,
}: {
  searchParams: { centre?: string };
}) {
  const user = await requireUser();
  if (!canConduct(user.role)) redirect("/");

  const centres = await prisma.centre.findMany({
    where: { ...centreScope({ id: user.id, role: user.role }), status: "OPEN" },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, size: true },
  });

  return (
    <main className="mx-auto max-w-lg p-6">
      <Link href="/" className="text-sm text-sky-600">
        ← Back
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-navy">Start an inspection</h1>
      <p className="mt-1 text-sm text-slate-500">
        The clock starts when you begin, and pauses whenever you leave the inspection.
      </p>
      <StartForm centres={centres} preselect={searchParams.centre} />
    </main>
  );
}
