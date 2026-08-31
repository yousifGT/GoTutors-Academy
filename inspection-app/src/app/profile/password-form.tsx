"use client";

import { useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { MIN_PASSWORD } from "@/lib/user-rules";

export function PasswordForm() {
  const { data: session } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDone(false);
    if (next !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/me/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ current, next }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(body.error ?? "Could not change your password.");
      return;
    }
    // Changing the password signs out every session opened with the old one —
    // which includes this browser, since the point is that someone else may
    // have had it. Signing straight back in with the password they just chose
    // keeps them where they are and leaves everything else signed out; without
    // this, changing your password throws you out of the page you did it on.
    if (session?.user?.email) {
      await signIn("credentials", { email: session.user.email, password: next, redirect: false });
    }

    // Only now: the button stayed disabled through the re-authentication too,
    // rather than going idle while the form was still working.
    setBusy(false);
    setDone(true);
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="font-semibold text-navy">Change your password</h2>
      <p className="mt-1 text-xs text-slate-500">
        Whoever set up your account knows the password they gave you. Replace it with one only you know.
      </p>

      <Field label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
      <Field
        label={`New password (at least ${MIN_PASSWORD} characters)`}
        value={next}
        onChange={setNext}
        autoComplete="new-password"
      />
      <Field label="New password again" value={confirm} onChange={setConfirm} autoComplete="new-password" />

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          Your password has been changed. Anywhere else you were signed in has been signed out.
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !current || !next || !confirm}
        className="mt-5 rounded-lg bg-navy px-4 py-2.5 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="mt-4 block text-sm font-medium text-slate-700">
      {label}
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky focus:ring-2 focus:ring-sky/30"
      />
    </label>
  );
}
