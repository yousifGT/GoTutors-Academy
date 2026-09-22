"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Delete, or archive.
 *
 * A scheme with marked papers against it is archived rather than deleted — the
 * server decides that, not this component, so the message here says what will
 * actually happen instead of guessing.
 */
export function SchemeDangerZone({ schemeId, paperCount }: { schemeId: string; paperCount: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/schemes/${schemeId}`, { method: "DELETE", headers: { "content-type": "application/json" } });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage(body.error ?? "That did not work.");
    if (body.archived) {
      setMessage(body.message);
      router.refresh();
      return;
    }
    router.push("/schemes");
    router.refresh();
  }

  return (
    <div className="card border-coral/30">
      <h3 className="font-bold text-coral">Remove this mark scheme</h3>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {paperCount > 0
          ? `${paperCount} marked paper${paperCount === 1 ? " uses" : "s use"} this scheme, so it will be archived rather than deleted — those reports would be unreadable without it.`
          : "Nothing has been marked against it, so it will be deleted outright."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <button onClick={remove} disabled={busy} className="btn-danger text-sm">
              {busy ? "Working…" : paperCount > 0 ? "Yes, archive it" : "Yes, delete it"}
            </button>
            <button onClick={() => setConfirming(false)} className="btn-ghost text-sm">
              Cancel
            </button>
          </>
        ) : (
          <button onClick={() => setConfirming(true)} className="btn-ghost text-sm">
            {paperCount > 0 ? "Archive" : "Delete"}
          </button>
        )}
      </div>
      {message && <div className="mt-2 text-sm text-[var(--muted)]">{message}</div>}
    </div>
  );
}
