"use client";

import { useState } from "react";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/password/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    // Always the same, whatever came back. The server does not say whether the
    // address is known, and neither does this.
    setDone(body.message ?? "If that address has an account, a link to set a new password is on its way.");
  }

  if (done) {
    return (
      <p className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
        {done}
      </p>
    );
  }

  return (
    <form onSubmit={submit}>
      <p className="mt-4 text-sm text-slate-600">
        Enter the address you sign in with and we will send you a link to set a new password.
      </p>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        Email
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky focus:ring-2 focus:ring-sky/30"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="mt-6 w-full rounded-lg bg-navy px-4 py-2.5 font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send the link"}
      </button>
    </form>
  );
}
