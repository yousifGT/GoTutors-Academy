"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DuplicateCourseButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function duplicate() {
    if (!confirm("Create a draft copy of this course?")) return;
    setBusy(true);
    const res = await fetch(`/api/courses/${courseId}/duplicate`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return alert(data.error ?? "Failed");
    router.push(`/instructor/courses/${data.id}`);
  }
  return <button onClick={duplicate} disabled={busy} className="gt-btn-ghost">{busy ? "Duplicating…" : "Duplicate"}</button>;
}
