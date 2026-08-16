"use client";
import { useState } from "react";

/**
 * Change your own password. Used voluntarily from the profile, and on the forced
 * screen after an admin has set a temporary one.
 */
export function PasswordChangeForm({
  onDone,
  autoFocus = false,
}: {
  onDone?: () => void | Promise<void>;
  autoFocus?: boolean;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Checked here for a quick answer; the server re-checks everything.
    if (next !== confirm) return setError("The two new passwords don't match.");
    if (next.length < 6) return setError("Your new password must be at least 6 characters.");

    setBusy(true);
    const res = await fetch("/api/me/password", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Couldn't change your password. Please try again.");
      return;
    }
    setDone(true);
    setCurrent(""); setNext(""); setConfirm("");
    await onDone?.();
  }

  if (done && !onDone) {
    return <p className="text-sm font-medium text-mint">✓ Your password has been changed.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="gt-label" htmlFor="current-password">Current password</label>
        <input
          id="current-password"
          type="password"
          autoFocus={autoFocus}
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          className="gt-input"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="gt-label" htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={6}
            className="gt-input"
          />
        </div>
        <div>
          <label className="gt-label" htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            className="gt-input"
          />
        </div>
      </div>
      {error && <p className="text-sm text-orange">{error}</p>}
      <button disabled={busy} className="gt-btn-primary">
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
