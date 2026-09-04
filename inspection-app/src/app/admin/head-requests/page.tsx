import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canDecideHeadRequest } from "@/lib/access";
import { RequestQueue } from "./request-queue";

export const dynamic = "force-dynamic";

/**
 * Every request waiting for an answer, in one place.
 *
 * A franchisee raises these on their own centre's page, which is the natural
 * place to do it from — but nobody would find them again by visiting each
 * centre in turn hoping one had a request on it. The queue is what makes the
 * approval step a thing that actually happens rather than a thing requests go
 * to die in.
 */
export default async function HeadRequestsPage() {
  const user = await requireUser();
  if (!canDecideHeadRequest(user.role)) redirect("/admin/users");

  const rows = (await prisma.centreHeadRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      status: true,
      note: true,
      decisionNote: true,
      createdAt: true,
      decidedAt: true,
      centre: { select: { id: true, name: true } },
      head: { select: { id: true, name: true, email: true } },
      askedBy: { select: { name: true, email: true } },
      decidedBy: { select: { name: true } },
    },
  })).map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
  }));

  const pending = rows.filter((r) => r.status === "PENDING");
  const answered = rows.filter((r) => r.status !== "PENDING").slice(0, 30);

  return (
    <main className="mt-6">
      <h1 className="text-2xl font-bold text-navy">Head of centre requests</h1>
      <p className="mt-1 text-sm text-slate-500">
        A franchisee can ask for somebody to be made head of one of their centres. Nobody gains access to a centre&apos;s
        inspection records until you approve it here. Approving adds them alongside anyone already running the centre;
        it never removes anybody.
      </p>

      <RequestQueue pending={pending} answered={answered} />

      <p className="mt-6 text-sm text-slate-500">
        Removing a head of centre, or setting them all at once, is done on the{" "}
        <Link href="/admin/centres" className="text-sky-600">
          centre itself
        </Link>
        .
      </p>
    </main>
  );
}
