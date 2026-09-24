"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { sendJson } from "@/lib/client";

/** First run: name the centre, create the first admin, and sign them straight in. */
export function SetupForm() {
  const [organisationName, setOrganisation] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await sendJson("/api/setup", "POST", { organisationName, name, email, password });
    if (!result.ok) {
      setBusy(false);
      return setError(result.error);
    }
    const signedIn = await signIn("credentials", { email, password, redirect: false });
    setBusy(false);
    if (signedIn?.error) {
      setError("The account was created, but signing in failed. Try the login page.");
      return;
    }
    window.location.assign("/");
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-3">
      <input
        className="input"
        placeholder="Centre name"
        value={organisationName}
        onChange={(e) => setOrganisation(e.target.value)}
        required
      />
      <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
      <input
        className="input"
        type="email"
        autoComplete="username"
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        className="input"
        type="password"
        autoComplete="new-password"
        placeholder="Password (at least 10 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <div className="text-sm text-coral">{error}</div>}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Setting up…" : "Create the centre"}
      </button>
    </form>
  );
}
