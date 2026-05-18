"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function EnrolButton({ courseId, label = "Enrol" }: { courseId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function enrol() {
    setBusy(true);
    const res = await fetch("/api/enrollments", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseId }),
    });
    setBusy(false);
    if (res.ok) router.push(`/trainee/courses/${courseId}`);
  }
  return (
    <button onClick={enrol} disabled={busy} className="gt-btn-accent w-full">
      {busy ? "Enrolling…" : label}
    </button>
  );
}
