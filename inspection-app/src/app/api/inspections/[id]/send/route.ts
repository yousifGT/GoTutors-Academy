import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute } from "@/lib/api";
import { audit } from "@/lib/audit";
import { viewerOr401 } from "@/lib/session";
import { canConduct, inspectionScope } from "@/lib/access";
import { sendReportNow, sendReportTo } from "@/lib/send-report";
import { parseJson } from "@/lib/validate";
import { z } from "zod";

const SendSchema = z.object({
  /** Send to the people registered as receiving this centre's reports. */
  toCentre: z.boolean().default(true),
  /**
   * And/or to addresses typed on the day — a franchisee, a regional lead, a
   * head of centre whose account is not set up yet. Capped low on purpose:
   * this is "and copy in the area manager", not a mailing list.
   */
  alsoTo: z.array(z.string().trim().toLowerCase().email()).max(5).default([]),
});

type Ctx = { params: Promise<{ id: string }> };

/**
 * Send this report to whoever runs the centre, on purpose.
 *
 * Submitting already emails it. This is for afterwards — it never arrived, the
 * address was wrong and has been corrected, or the head of centre was appointed
 * after the visit. Without it the only recourse was the sweep, which correctly
 * leaves alone a delivery it considers finished.
 *
 * It can go to two kinds of address, and the difference is deliberate:
 *
 *   - the people registered as receiving this centre's reports, who each have a
 *     delivery row, a read receipt and a retry schedule, because the app is
 *     responsible for getting the report to them;
 *   - addresses typed on the day, which get one message, sent once, recorded in
 *     the audit log with who asked for it. No delivery row: an address nobody
 *     verified must not appear in the list the screen reads as "who this
 *     centre's reports go to".
 *
 * The second was refused until GoTutors asked for it, on the basis that the
 * photographs are of books and of work rather than of people. It is still the
 * looser of the two paths — a PDF of a centre's inspection leaving to an
 * unverified address — so the address is logged every time, and the screen says
 * plainly where it is about to go before it goes.
 *
 * Who may press it: the people who carry out or oversee inspections, and only
 * for an inspection they can already read — so an inspector can re-send their
 * own visit and nobody else's. Read-only accounts are excluded: sending mail is
 * an outward act, and that role changes nothing.
 */
export const POST = withRoute(async (req: Request, ctx: Ctx) => {
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

  // An empty body means "the registered recipients", which is what the button
  // did before there was anything to choose.
  const raw = await req.text();
  const parsed = raw
    ? await parseJson(new Request(req.url, { method: "POST", headers: { "content-type": "application/json" }, body: raw }), SendSchema)
    : ({ ok: true, data: { toCentre: true, alsoTo: [] } } as const);
  if (!parsed.ok) return parsed.response;
  const { toCentre, alsoTo } = parsed.data;

  if (!toCentre && alsoTo.length === 0)
    return NextResponse.json({ error: "Choose who to send it to." }, { status: 400 });

  const outcomes = toCentre ? await sendReportNow(inspection.id) : [];

  if (toCentre && outcomes.length === 0 && alsoTo.length === 0)
    return NextResponse.json(
      {
        error: `Nobody is set to receive ${inspection.centre.name}'s reports. Add a head of centre, franchisee or regional manager to the centre, or type an address to send it to.`,
      },
      { status: 409 }
    );

  // De-duplicated against each other and against the registered recipients, so
  // typing the head of centre's own address does not send them two copies.
  const already = new Set(outcomes.map((o) => o.to?.toLowerCase()).filter(Boolean));
  const external: typeof outcomes = [];
  for (const address of Array.from(new Set(alsoTo))) {
    if (already.has(address)) continue;
    already.add(address);
    external.push(await sendReportTo(inspection.id, address));
  }

  if (external.length) {
    const went = external.filter((o) => o.status === "SENT");
    await audit({
      actorId: who.viewer.id,
      action: "report.sent_external",
      target: inspection.id,
      metadata: {
        centre: inspection.centre.name,
        // Every typed address, whether or not it went. This is the whole record
        // that it left the building.
        to: external.map((o) => o.to).join(", "),
        sent: went.length,
        of: external.length,
        ...(went.length < external.length
          ? { problem: external.find((o) => o.status !== "SENT")?.error ?? "not sent" }
          : {}),
      },
    });
  }

  const sent = outcomes.filter((o) => o.status === "SENT");
  if (outcomes.length) {
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
  }

  const all = [...outcomes, ...external];
  return NextResponse.json({ ok: all.some((o) => o.status === "SENT"), outcomes: all });
});
