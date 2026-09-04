import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canConduct, inspectionScope } from "@/lib/access";
import { sendReportNow } from "@/lib/send-report";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Send this report to whoever runs the centre, on purpose.
 *
 * Submitting already emails it. This is for afterwards — it never arrived, the
 * address was wrong and has been corrected, or the head of centre was appointed
 * after the visit. Without it the only recourse was the sweep, which correctly
 * leaves alone a delivery it considers finished.
 *
 * It goes to the address registered on their account, never one typed into the
 * request. A report carries photographs from inside a centre, and an endpoint
 * that emails a PDF to an address of the caller's choosing is a way to get data
 * out of the system, not a convenience.
 *
 * Who may press it: the people who carry out or oversee inspections, and only
 * for an inspection they can already read — so an inspector can re-send their
 * own visit and nobody else's. Read-only accounts are excluded: sending mail is
 * an outward act, and that role changes nothing.
 */
export const POST = withRoute(async (_req: Request, ctx: Ctx) => {
  const params = await ctx.params;
  const who = await viewerOr401();
  if ("response" in who) return who.response;
  if (!canConduct(who.viewer.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const inspection = await prisma.inspection.findFirst({
    where: { AND: [{ id: params.id }, inspectionScope(who.viewer)] },
    select: {
      id: true,
      status: true,
      centre: { select: { name: true } },
    },
  });
  if (!inspection) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (inspection.status !== "SUBMITTED")
    return NextResponse.json(
      { error: "This inspection has not been submitted yet, so there is no report to send." },
      { status: 409 }
    );

  const outcomes = await sendReportNow(inspection.id);

  if (outcomes.length === 0)
    return NextResponse.json(
      {
        error: `Nobody is set to receive ${inspection.centre.name}'s reports. Add a head of centre, franchisee or regional manager to the centre first.`,
      },
      { status: 409 }
    );

  const sent = outcomes.filter((o) => o.status === "SENT");
  await audit({
    actorId: who.viewer.id,
    action: "report.sent",
    target: inspection.id,
    metadata: {
      centre: inspection.centre.name,
      sent: sent.length,
      of: outcomes.length,
      // The addresses it actually went to, so the log answers "who was told".
      to: sent.map((o) => o.to).filter(Boolean).join(", ") || null,
      ...(sent.length < outcomes.length
        ? { problem: outcomes.find((o) => o.status !== "SENT")?.error ?? "not sent" }
        : {}),
    },
  });

  return NextResponse.json({ ok: sent.length > 0, outcomes });
});
