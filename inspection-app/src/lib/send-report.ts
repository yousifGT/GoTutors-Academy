import { prisma } from "@/lib/prisma";
import { buildReport, reportInclude } from "@/lib/report";
import { loadPhotos, photoUrls } from "@/lib/report-photos";
import { renderReportPdf, reportFilename } from "@/lib/report-pdf";
import { reportBody, reportSubject } from "@/lib/report-email";
import { sendEmail } from "@/lib/email";
import { emailBackend } from "@/lib/email-config";
import { previouslyFlaggedAt } from "@/lib/previous";

/**
 * Getting a finished report into somebody's inbox.
 *
 * The state lives on the ReportDelivery row, not in a queue this app would have
 * to run: it is a handful of messages a day, and a row that says PENDING with
 * an attempt count is something an administrator can look at and a support
 * question can be answered from. "It was emailed" is a claim someone will one
 * day have to stand behind.
 *
 * Two things drive it. Submitting an inspection tries immediately, so the report
 * arrives while the inspector is still standing in the building. A timer in the
 * process sweeps up anything that attempt did not finish — the task was replaced
 * mid-send, SES was throttling, an address was briefly unreachable. Neither can
 * lose a report: the row is written before either runs.
 *
 * The sweep is in-process rather than a scheduled task on the side because the
 * PDF renderer only works inside the application's own module resolution; a
 * standalone script cannot load it. That turns out to be the better shape
 * anyway — nothing extra for an operator to schedule, and the delivery rows are
 * the record of what happened.
 */

/** How long to wait before attempt n+1. Roughly a minute, then 5, 25, two hours. */
const BACKOFF_SEC = [60, 300, 1500, 7200];
export const MAX_ATTEMPTS = BACKOFF_SEC.length + 1;

export interface SendOutcome {
  deliveryId: string;
  status: "SENT" | "PENDING" | "FAILED" | "SKIPPED";
  to?: string;
  error?: string;
}

/** How long a claimed delivery is left alone for, so two instances cannot both send it. */
const LEASE_SEC = 300;

/**
 * Take ownership of some deliveries that are due, so no other instance sends
 * them too.
 *
 * `emailNextAt` doubles as the lease: it already means "do not touch before
 * this", whether that is because a failed attempt is backing off or because
 * somebody else is working on it. Pushing it forward before sending means a
 * second instance sweeping at the same moment sees nothing to do, and a sender
 * that dies mid-send has its work picked up again once the lease runs out
 * rather than being stranded.
 *
 * Claimed one row at a time on purpose: `updateMany` cannot say which rows it
 * changed, so a batch claim cannot tell this instance what it now owns.
 */
export async function claimDeliveries(limit = 20, now = new Date()) {
  const due = await prisma.reportDelivery.findMany({
    where: {
      emailStatus: "PENDING",
      OR: [{ emailNextAt: null }, { emailNextAt: { lte: now } }],
    },
    orderBy: { deliveredAt: "asc" },
    take: limit,
    select: { id: true, emailNextAt: true },
  });

  const mine: string[] = [];
  for (const row of due) {
    const claimed = await prisma.reportDelivery.updateMany({
      // The same condition again, so a row another instance took between the
      // read above and this write is not claimed twice.
      where: {
        id: row.id,
        emailStatus: "PENDING",
        OR: [{ emailNextAt: null }, { emailNextAt: { lte: now } }],
      },
      data: { emailNextAt: new Date(now.getTime() + LEASE_SEC * 1000) },
    });
    if (claimed.count === 1) mine.push(row.id);
  }
  return mine;
}

/**
 * Send one delivery and record what happened.
 *
 * Never throws: a failure is an outcome to be written down, and a sender that
 * throws halfway through a batch leaves the rest of the batch unsent.
 */
export async function sendOneDelivery(deliveryId: string): Promise<SendOutcome> {
  const delivery = await prisma.reportDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      inspectionId: true,
      emailAttempts: true,
      emailStatus: true,
      user: { select: { name: true, email: true, active: true } },
    },
  });
  if (!delivery) return { deliveryId, status: "FAILED", error: "delivery not found" };
  if (delivery.emailStatus === "SENT") return { deliveryId, status: "SENT" };

  // Nothing to send to, or nowhere to send it. Both are settled states rather
  // than failures to retry — retrying will not conjure an address.
  const skip = skipReason(delivery.user);
  if (skip) {
    await prisma.reportDelivery.update({
      where: { id: delivery.id },
      data: { emailStatus: "SKIPPED", emailError: skip, emailNextAt: null },
    });
    return { deliveryId, status: "SKIPPED", error: skip };
  }

  const to = delivery.user.email;
  try {
    const inspection = await prisma.inspection.findUnique({
      where: { id: delivery.inspectionId },
      include: reportInclude,
    });
    if (!inspection) throw new Error("inspection not found");

    const report = buildReport(inspection, await previouslyFlaggedAt(inspection.centreId, inspection.id));
    const photos = await loadPhotos(photoUrls(report));
    const pdf = await renderReportPdf(report, photos);
    const body = reportBody(report, {
      name: delivery.user.name,
      inspectionId: delivery.inspectionId,
      appUrl: process.env.NEXTAUTH_URL || "",
    });

    // A report with a lot of photographs can be too big to send. Base64 in a
    // MIME message adds a third, SES will not carry it, and Gmail and Outlook
    // refuse it inbound. Attaching it anyway means five failed attempts, five
    // full re-renders each, and then a permanent FAILED — the centre head is
    // never told anything. Sending the message without the attachment gets them
    // the finding and a link to the whole thing, which is the part that matters.
    const tooBig = pdf.length > maxAttachmentBytes();
    if (tooBig) {
      console.warn("report PDF too large to attach; sending a link instead", {
        deliveryId,
        bytes: pdf.length,
        limit: maxAttachmentBytes(),
      });
    }

    await sendEmail({
      to,
      subject: reportSubject(report),
      text: tooBig ? withoutAttachmentNote(body.text) : body.text,
      html: tooBig ? withoutAttachmentNote(body.html) : body.html,
      attachments: tooBig
        ? []
        : [{ filename: reportFilename(report), content: pdf, contentType: "application/pdf" }],
    });

    await prisma.reportDelivery.update({
      where: { id: delivery.id },
      data: {
        emailStatus: "SENT",
        emailTo: to,
        emailedAt: new Date(),
        emailAttempts: { increment: 1 },
        emailNextAt: null,
        emailError: null,
      },
    });
    return { deliveryId, status: "SENT", to };
  } catch (e) {
    const attempts = delivery.emailAttempts + 1;
    const giveUp = attempts >= MAX_ATTEMPTS;
    const wait = BACKOFF_SEC[Math.min(attempts - 1, BACKOFF_SEC.length - 1)];
    const message = String(e instanceof Error ? e.message : e).slice(0, 500);

    await prisma.reportDelivery.update({
      where: { id: delivery.id },
      data: {
        // FAILED is a stopping point that needs a person, not a quieter kind of
        // pending: after this many attempts the address or the configuration is
        // wrong, and retrying forever only hides it.
        emailStatus: giveUp ? "FAILED" : "PENDING",
        emailTo: to,
        emailAttempts: attempts,
        emailNextAt: giveUp ? null : new Date(Date.now() + wait * 1000),
        emailError: message,
      },
    });
    console.error("report email failed", { deliveryId, attempts, giveUp, to, err: message });
    return { deliveryId, status: giveUp ? "FAILED" : "PENDING", to, error: message };
  }
}

/**
 * The largest PDF worth attaching.
 *
 * Well under what SES accepts, because the receiving end is stricter: Outlook
 * refuses over 20MB and Gmail over 25MB, and base64 adds a third on the way.
 */
function maxAttachmentBytes(): number {
  const raw = Number(process.env.EMAIL_MAX_ATTACHMENT_BYTES);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 12 * 1024 * 1024;
}

/** Says plainly that the attachment is missing, rather than leaving them looking for it. */
function withoutAttachmentNote(body: string): string {
  const note =
    "This report has too many photographs to attach to an email. Open it on the site with the link above — everything is there, at full size.";
  return body.includes("</p>")
    ? body.replace(
        "</div>\n</body>",
        `<p style="margin:16px 0 0;padding:12px 16px;border-radius:8px;background:#fffbeb;color:#78350f">${note}</p></div>\n</body>`
      )
    : `${body}\n\n${note}\n`;
}

function skipReason(user: { email: string; active: boolean }): string | null {
  if (!user.email) return "no email address on the account";
  if (!user.active) return "account is deactivated";
  if (emailBackend() === "console") return "email sending is not configured";
  return null;
}

/**
 * Try every delivery for one inspection, without making the caller wait.
 *
 * Submitting an inspection should not block on SES: the inspector is on a phone
 * in a building, and a report that takes three seconds longer to arrive is
 * nothing next to a submit that appears to hang. Anything this does not finish
 * is still PENDING for `email:flush` to pick up, so nothing is lost by not
 * waiting.
 */
export function sendReportsInBackground(inspectionId: string): void {
  void (async () => {
    try {
      const rows = await prisma.reportDelivery.findMany({
        where: { inspectionId, emailStatus: "PENDING" },
        select: { id: true },
      });
      for (const row of rows) await sendOneDelivery(row.id);
    } catch (e) {
      // Left PENDING on purpose — the flush will find it.
      console.error("background report email failed", { inspectionId, err: e });
    }
  })();
}


/**
 * The sweep: anything a submit did not manage to send, tried again.
 *
 * Every instance runs one. They do not coordinate beyond the lease in
 * `claimDeliveries`, which is enough — the work is idempotent and a delivery
 * already SENT is returned untouched.
 */
const SWEEP_MS = 60_000;
let sweeping: ReturnType<typeof setInterval> | null = null;

export function startReportEmailSweep(): void {
  if (sweeping) return;
  sweeping = setInterval(() => void sweepOnce(), SWEEP_MS);
  // Do not hold the process open for it: a container being drained should stop
  // when its requests are done, not wait out a timer.
  sweeping.unref?.();
}

export async function sweepOnce(): Promise<SendOutcome[]> {
  try {
    const ids = await claimDeliveries();
    const out: SendOutcome[] = [];
    for (const id of ids) out.push(await sendOneDelivery(id));
    const failed = out.filter((o) => o.status === "FAILED");
    if (failed.length) console.error(`report email: gave up on ${failed.length} delivery(ies)`, failed);
    return out;
  } catch (e) {
    console.error("report email sweep failed", e);
    return [];
  }
}
