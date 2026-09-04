"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { shortDate } from "@/lib/format";

/**
 * A visit in progress, with the two things you can do with it.
 *
 * Discarding one was only reachable from the Debrief tab, at the far end of the
 * inspection you wanted to be rid of — so a draft started by mistake, or one
 * left on an old checklist, was easier to abandon than to remove. It belongs
 * here, next to "Resume", which is where a person actually meets it.
 */
export function DraftCard({
  id,
  centreName,
  date,
  checklistVersion,
  liveChecklistVersion,
}: {
  id: string;
  centreName: string;
  date: string;
  checklistVersion?: number;
  liveChecklistVersion?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stale =
    checklistVersion !== undefined && liveChecklistVersion !== undefined && checklistVersion !== liveChecklistVersion;

  async function discard() {
    if (
      !confirm(
        `Discard the visit to ${centreName} started on ${shortDate(date)}? Everything recorded in it is deleted and cannot be recovered.`
      )
    )
      return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/inspections/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not discard it.");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200">
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href={`/inspections/${id}`} className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-amber-900">
            Resume {centreName} — started {shortDate(date)}
          </span>
          {stale && (
            <span className="block text-xs text-amber-800">
              on checklist v{checklistVersion}; the live one is v{liveChecklistVersion}
            </span>
          )}
        </Link>
        <button
          onClick={discard}
          disabled={busy}
          className="shrink-0 text-xs font-medium text-red-700 underline disabled:opacity-50"
        >
          {busy ? "Discarding…" : "Discard"}
        </button>
        <Link href={`/inspections/${id}`} className="shrink-0 text-sm font-semibold text-amber-900">
          →
        </Link>
      </div>
      {error && <p className="px-4 pb-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
