"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Step 3 of the demo wizard: the explicit publish / keep-draft decision. */
export function PublishActions({ courseId, published }: { courseId: string; published: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function publish() {
    setBusy(true);
    const res = await fetch(`/api/courses/${courseId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ published: true }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return alert(data.error ?? "Could not publish");
    }
    router.push("/instructor/courses?published=1");
    router.refresh();
  }

  if (published) {
    return (
      <button onClick={() => router.push("/instructor/courses")} className="gt-btn-primary">
        Done
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={publish} disabled={busy} className="gt-btn-primary">
        {busy ? "Publishing…" : "Publish now"}
      </button>
      <button onClick={() => { router.push("/instructor/courses"); router.refresh(); }} disabled={busy} className="gt-btn-ghost">
        Finish as draft
      </button>
      <span className="text-xs text-[var(--muted)]">Publishing automatically enrols every matching trainee.</span>
    </div>
  );
}
