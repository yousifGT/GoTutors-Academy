"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Publish / unpublish a course straight from the course list. Hits the course
 * PATCH route, which is ownership-guarded (an instructor may only toggle their
 * own courses; a super admin may toggle any).
 */
export function CoursePublishToggle({ courseId, published }: { courseId: string; published: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await fetch(`/api/courses/${courseId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ published: !published }),
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Could not update the course.");
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`text-sm ${published ? "gt-btn-ghost" : "gt-btn-primary"}`}
    >
      {busy ? "…" : published ? "Unpublish" : "Publish"}
    </button>
  );
}
