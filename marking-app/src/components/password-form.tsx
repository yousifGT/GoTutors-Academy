"use client";
import { useState } from "react";

/**
 * Changing your own password.
 *
 * `afterChange` matters: the session cookie changes on the server, and Next's
 * client router cache can still hold a redirect issued seconds ago — so a soft
 * navigation lands back on the screen you just left. A full page load is the
 * only reliable way out of the forced-change hold.
 */
export function PasswordForm({ afterChange }: { afterChange?: string }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) return setError("The two new passwords do not match.");
    setBusy(true);
    const res = await fetch("/api/me/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "That could not be saved.");

    if (afterChange) {
      window.location.assign(afterChange);
      return;
    }
    setDone(true);
    setCurrent("");
    setNew("");
    setConfirm("");
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <input
        className="input"
        type="password"
        autoComplete="current-password"
        placeholder="Current password"
        value={currentPassword}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <input
        className="input"
        type="password"
        autoComplete="new-password"
        placeholder="New password (at least 10 characters)"
        value={newPassword}
        onChange={(e) => setNew(e.target.value)}
      />
      <input
        className="input"
        type="password"
        autoComplete="new-password"
        placeholder="New password again"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {error && <div className="text-sm text-coral">{error}</div>}
      {done && <div className="text-sm text-teal">Password changed.</div>}
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
