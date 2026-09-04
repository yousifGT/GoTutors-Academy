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
  const [toCentre, setToCentre] = useState(recipients.length > 0);
  const [alsoTo, setAlsoTo] = useState("");

  // One per line or comma-separated, whichever the person types.
  const extras = alsoTo
    .split(/[\n,;]+/)
    .map((a) => a.trim())
    .filter(Boolean);
  const bad = extras.filter((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
  const nothingChosen = (!toCentre || recipients.length === 0) && extras.length === 0;

  async function send() {
    const going = [
      ...(toCentre ? recipients.map((r) => `${r.name} (${r.email})`) : []),
      ...extras,
    ];
    if (!confirm(`Email this report, with its photographs attached, to:\n\n${going.join("\n")}`)) return;
    setBusy(true);
    setNotice("");
    setError("");
    const res = await fetch(`/api/inspections/${inspectionId}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toCentre, alsoTo: extras }),
    });
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
      setAlsoTo("");
    } else {
      // Never claim it went. The commonest reason here is that email is not
      // configured at all, which looks identical to success if you only check
      // the HTTP status.
      setError(outcomes[0]?.error ?? "Nothing was sent.");
    }
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-xl bg-white p-5 ring-1 ring-slate-200">
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

      {recipients.length > 0 && (
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={toCentre}
            onChange={(e) => setToCentre(e.target.checked)}
            className="accent-sky-600"
          />
          Send to {recipients.length === 1 ? "them" : "all of them"}
        </label>
      )}

      <div className="mt-3">
        <label htmlFor="also-to" className="block text-sm font-medium text-slate-700">
          And to another address
        </label>
        <p className="text-xs text-slate-500">
          One per line. Goes to whoever you type, with the photographs attached, and is recorded in the activity log.
        </p>
        <textarea
          id="also-to"
          value={alsoTo}
          onChange={(e) => setAlsoTo(e.target.value)}
          rows={2}
          placeholder="area.manager@example.com"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
        />
        {bad.length > 0 && (
          <p className="mt-1 text-xs text-red-700">
            {bad.length === 1 ? "That does not look like an email address" : "Those do not look like email addresses"}:{" "}
            {bad.join(", ")}
          </p>
        )}
      </div>

      <button
        onClick={send}
        disabled={busy || nothingChosen || bad.length > 0}
        className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-navy disabled:opacity-50"
      >
        {busy
          ? "Sending…"
          : extras.length && toCentre && recipients.length
            ? `Send to ${recipients.length + extras.length} people`
            : extras.length
              ? `Send to ${extras.length === 1 ? "that address" : `${extras.length} addresses`}`
              : recipients.some((r) => r.status === "SENT")
                ? "Send it again"
                : "Send by email"}
      </button>

      {notice && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
