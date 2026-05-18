"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UnlockButton({ userId, quizId }: { userId: string; quizId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function unlock() {
    setLoading(true);
    await fetch("/api/quiz/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, quizId }),
    });
    setLoading(false);
    router.refresh();
  }
  return <button onClick={unlock} disabled={loading} className="gt-btn-accent text-sm">{loading ? "Unlocking…" : "Unlock retries"}</button>;
}
