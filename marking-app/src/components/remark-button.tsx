"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Ask for a paper to be marked (again). Safe to press twice — the route refuses a second run. */
export function RemarkButton({ submissionId, label = "Try marking again" }: { submissionId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/submissions/${submissionId}/mark`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Marking failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button onClick={run} disabled={busy} className="btn-accent text-sm">
        {busy ? "Marking…" : label}
      </button>
      {error && <div className="text-sm text-coral">{error}</div>}
    </div>
  );
}
