"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Checked here rather than sent to the server: a mistyped confirmation is
    // the user's own slip, and spending the one-use token on it would make them
    // ask for a whole new link.
    if (password !== again) {
      setError("Those two do not match.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/password/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "That did not work.");
      return;
    }
    setDone(true);
  }

  if (!token) {
    return (
      <p className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
        This link is incomplete. Open the one from your email, or ask for another.
      </p>
    );
  }

  if (done) {
    return (
      <div className="mt-6">
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          Your password is set. Anything else that was signed in has been signed out.
        </p>
        <button
          onClick={() => router.push("/login")}
          className="mt-4 w-full rounded-lg bg-navy px-4 py-2.5 font-semibold text-white"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <label className="mt-6 block text-sm font-medium text-slate-700">
        New password
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky focus:ring-2 focus:ring-sky/30"
        />
      </label>
      <label className="mt-4 block text-sm font-medium text-slate-700">
        Again
        <input
          type="password"
          required
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky focus:ring-2 focus:ring-sky/30"
        />
      </label>
      <p className="mt-2 text-xs text-slate-500">At least 12 characters, and not something guessable.</p>
      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mt-6 w-full rounded-lg bg-navy px-4 py-2.5 font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Setting…" : "Set the password"}
      </button>
    </form>
  );
}
