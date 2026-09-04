"use client";

import { useState } from "react";
import type { EmailSettings } from "@/lib/email-config";

const BACKEND_LABEL: Record<string, string> = {
  console: "Not sending — written to the server log",
  smtp: "SMTP",
  ses: "Amazon SES",
};

export function EmailTester({ settings, suggested }: { settings: EmailSettings; suggested: string }) {
  const [to, setTo] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setSent("");
    setError("");
    const res = await fetch("/api/email/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && body.ok) setSent(`Sent to ${body.to}, from ${body.from}. If it does not arrive, check the spam folder.`);
    else setError(body.error ?? "Could not send.");
  }

  const off = settings.backend === "console";

  return (
    <main className="mt-6">
      <h1 className="text-2xl font-bold text-navy">Email</h1>
      <p className="mt-1 text-sm text-slate-500">
        How reports leave the app. These come from the environment it runs in, not from this screen — an SMTP password
        typed into a form would end up in the database and in every backup of it.
      </p>

      {off ? (
        <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <strong>Nothing is being sent.</strong> `EMAIL_BACKEND` is not set, so reports are written to the server log
          instead of going anywhere. That is the default, so that running this on a laptop cannot post real inspection
          reports to real people.
        </p>
      ) : settings.missing.length > 0 ? (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          <strong>Not configured.</strong> Missing: {settings.missing.join(", ")}.
        </p>
      ) : null}

      <dl className="mt-5 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white text-sm ring-1 ring-slate-200">
        <Row label="Sending by" value={BACKEND_LABEL[settings.backend] ?? settings.backend} />
        <Row label="From" value={settings.from} />
        <Row label="Replies go to" value={settings.replyTo ?? "the From address"} />
        {settings.host && <Row label="Server" value={`${settings.host}:${settings.port}`} />}
        {settings.tls && (
          <Row label="Encryption" value={settings.tls === "implicit" ? "TLS from the start (port 465)" : "STARTTLS"} />
        )}
        {settings.backend === "smtp" && (
          <Row
            label="Signing in as"
            value={settings.user ? `${settings.user} — password ${settings.hasPassword ? "set" : "NOT set"}` : "no account (open relay)"}
          />
        )}
        {settings.region && <Row label="Region" value={settings.region} />}
      </dl>

      <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-semibold text-navy">Send a test message</h2>
        <p className="mt-1 text-sm text-slate-500">
          Proves the settings work without carrying out an inspection to find out.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Send the test to"
            placeholder="you@gotutors.com"
            className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky"
          />
          <button
            onClick={send}
            disabled={busy || !to.includes("@") || off}
            className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send test"}
          </button>
        </div>

        {sent && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sent}</p>}
        {error && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {/* Verbatim, on purpose. "Could not send" tells nobody anything;
                the server's own words name the setting that is wrong. */}
            <p className="font-medium">It did not send.</p>
            <p className="mt-1 break-words font-mono text-xs">{error}</p>
          </div>
        )}
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-2 px-4 py-2.5">
      <dt className="w-40 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words font-medium text-slate-800">{value}</dd>
    </div>
  );
}
