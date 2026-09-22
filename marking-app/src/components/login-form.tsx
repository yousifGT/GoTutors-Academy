"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setBusy(false);
      // Deliberately vague: saying which half was wrong tells an attacker which
      // addresses have accounts.
      setError("Those details were not recognised.");
      return;
    }
    // A first sign-in has nothing cached to fight with, so an ordinary
    // navigation is enough here.
    window.location.assign("/");
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-3">
      <input
        className="input"
        type="email"
        autoComplete="username"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        className="input"
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <div className="text-sm text-coral">{error}</div>}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
