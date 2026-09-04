"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Recipient {
  name: string;
  email: string;
  active: boolean;
  /** Null when this report has never been sent to them. */
  status: string | null;
  emailedAt: string | null;
  error: string | null;
}

/**
 * Send the report to whoever runs the centre.
 *
 * Submitting already does this. This is the button for afterwards, and it says
 * what has already happened first — a "send" with no indication of whether it
 * went the first time invites sending it three more times.
 *
 * There is no address field on purpose. It goes to the address registered on
 * the recipient's account; a report carries photographs from inside a centre,
 * and typing a destination on a phone is not a decision to make in a hurry.
 */
export function SendReportButton({
  inspectionId,
  recipients,
}: {
  inspectionId: string;
  recipients: Recipient[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function send() {
    const names = recipients.map((r) => `${r.name} (${r.email})`).join(", ");
    if (!confirm(recipients.length ? `Email this report to ${names}?` : "Email this report to whoever runs this centre?"))
      return;
    setBusy(true);
    setNotice("");
    setError("");
    const res = await fetch(`/api/inspections/${inspectionId}/send`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Could not send the report.");
      return;
    }
    const outcomes: { status: string; to?: string; error?: string }[] = body.outcomes ?? [];
    const sent = outcomes.filter((o) => o.status === "SENT");
    if (sent.length) {
      setNotice(`Sent to ${sent.map((o) => o.to).join(", ")}.`);
    } else {
      // Never claim it went. The commonest reason here is that email is not
      // configured at all, which looks identical to success if you only check
      // the HTTP status.
      setError(outcomes[0]?.error ?? "Nothing was sent.");
    }
    router.refresh();
  }

  return (
    <div className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Sending this report</h2>

      {recipients.length === 0 ? (
        <p className="mt-2 text-sm text-amber-800">
          Nobody is set to receive this centre&apos;s reports, so it has not been emailed to anyone. Add a head of
          centre to the centre and it can be sent.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {recipients.map((r) => (
            <li key={r.email} className="text-slate-700">
              <span className="font-medium">{r.name}</span> <span className="text-slate-500">({r.email})</span>
              {" — "}
              {!r.active ? (
                <span className="text-amber-800">account deactivated — nothing will be sent</span>
              ) : r.status === null ? (
                <span className="text-slate-500">not sent yet</span>
              ) : r.status === "SENT" && r.emailedAt ? (
                <span className="text-emerald-700">
                  emailed {new Date(r.emailedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              ) : r.status === "FAILED" ? (
                <span className="text-red-700">not sent — {r.error ?? "failed"}</span>
              ) : r.status === "SKIPPED" ? (
                <span className="text-amber-800">not sent — {r.error ?? "skipped"}</span>
              ) : (
                <span className="text-slate-500">waiting to send</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={send}
        disabled={busy || recipients.length === 0}
        className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-navy disabled:opacity-50"
      >
        {busy ? "Sending…" : recipients.some((r) => r.status === "SENT") ? "Send it again" : "Send by email"}
      </button>

      {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
