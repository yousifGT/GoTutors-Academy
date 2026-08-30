import type { Report } from "@/lib/report";

/**
 * What the report email says.
 *
 * Written for someone who runs a centre and is opening this on a phone, not for
 * someone who already knows what an inspection report looks like. The verdict
 * and the score go in the subject line, because that is what will be visible in
 * a list of unread mail and it is the thing they actually want to know.
 *
 * What it deliberately does not do: repeat the findings in the body. The
 * findings are in the attached PDF and on the site, both of which show them with
 * their photographs and their context. An email that half-restates them creates
 * a second version of the truth that nobody updates.
 */

export interface ReportEmailFor {
  /** who it is addressed to */
  name: string;
  /** the inspection, so the mail can link back to it */
  inspectionId: string;
  /** origin of the site, from NEXTAUTH_URL */
  appUrl: string;
}

export function reportSubject(report: Report): string {
  const critical = report.criticalFails.length > 0 ? " — action needed" : "";
  return `${report.centre} inspection, ${formatDate(report.date)}: ${report.verdict} (${report.pct}%)${critical}`;
}

export function reportBody(report: Report, to: ReportEmailFor): { text: string; html: string } {
  const when = formatDate(report.date);
  const link = `${to.appUrl.replace(/\/$/, "")}/inspections/${to.inspectionId}/report`;
  const criticals = report.criticalFails.length;
  const critical =
    criticals > 0
      ? `\nThis visit raised ${count(criticals, "critical finding")}. Those are the ones to look at first — they are marked in the report.\n`
      : "";

  const text = [
    `Hello ${firstName(to.name)},`,
    ``,
    `${report.centre} was inspected on ${when} by ${report.inspector}.`,
    ``,
    `Result: ${report.verdict}, ${report.pct}%.`,
    critical.trim(),
    ``,
    `The full report is attached, and it is also on the site, where you can see the photographs at full size:`,
    link,
    ``,
    `If anything in it looks wrong, reply to this message and it will reach the inspection team.`,
    ``,
    `GoTutors Inspections`,
  ]
    .filter((l, i, all) => !(l === "" && all[i - 1] === ""))
    .join("\n");

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
    <p style="margin:0 0 16px">Hello ${escapeHtml(firstName(to.name))},</p>
    <p style="margin:0 0 16px"><strong>${escapeHtml(report.centre)}</strong> was inspected on ${escapeHtml(when)} by ${escapeHtml(report.inspector)}.</p>
    <p style="margin:0 0 16px;padding:12px 16px;border-radius:8px;background:#f1f5f9">
      Result: <strong style="color:${escapeHtml(report.verdictColor)}">${escapeHtml(report.verdict)}</strong> &middot; ${report.pct}%
    </p>
    ${
      criticals > 0
        ? `<p style="margin:0 0 16px;padding:12px 16px;border-radius:8px;background:#fef2f2;color:#991b1b">This visit raised ${count(criticals, "critical finding")}. Those are the ones to look at first &mdash; they are marked in the report.</p>`
        : ""
    }
    <p style="margin:0 0 16px">The full report is attached, and it is also on the site, where you can see the photographs at full size.</p>
    <p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#0f2c52;color:#fff;text-decoration:none;font-weight:600">Open the report</a></p>
    <p style="margin:0;color:#475569;font-size:14px">If anything in it looks wrong, reply to this message and it will reach the inspection team.</p>
  </div>
</body></html>`;

  return { text, html };
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function formatDate(date: Date): string {
  // Read in UTC. The column is a bare date, so Prisma hands it back as midnight
  // UTC; formatting it in a local timezone west of Greenwich prints the day
  // before, and the report would name a date the inspector was not there.
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
