"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { timeAgo } from "@/lib/utils";

type Q = {
  id: string;
  type: "MULTIPLE_CHOICE" | "OPEN_ENDED";
  prompt: string;
  points: number;
  answers: { id: string; text: string; isCorrect: boolean }[];
};

export function ReviewQueueItem({
  attempt,
}: {
  attempt: {
    id: string;
    createdAt: string;
    userName: string;
    userEmail: string;
    courseTitle: string;
    lessonTitle: string;
    passThreshold: number;
    answers: Record<string, string>;
    questions: Q[];
  };
}) {
  const router = useRouter();
  const openQuestions = attempt.questions.filter((q) => q.type === "OPEN_ENDED");
  const [grades, setGrades] = useState<Record<string, boolean>>(
    Object.fromEntries(openQuestions.map((q) => [q.id, false]))
  );
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    await fetch(`/api/quiz/attempt/${attempt.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grades, note }),
    });
    setSubmitting(false);
    router.refresh();
  }

  return (
    <div className="gt-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-bold">{attempt.userName} <span className="text-[var(--muted)] text-sm">({attempt.userEmail})</span></div>
          <div className="text-xs text-[var(--muted)]">{attempt.courseTitle} · {attempt.lessonTitle} · submitted {timeAgo(attempt.createdAt)}</div>
        </div>
        <span className="gt-badge bg-gold/20 text-gold">Pending review</span>
      </div>

      <div className="mt-4 space-y-4">
        {attempt.questions.map((q, i) => {
          const submitted = attempt.answers?.[q.id];
          const isOpen = q.type === "OPEN_ENDED";
          let mcCorrect: boolean | null = null;
          let mcSubmittedText = "";
          if (!isOpen) {
            const correct = q.answers.find((a) => a.isCorrect);
            mcCorrect = !!submitted && submitted === correct?.id;
            mcSubmittedText = q.answers.find((a) => a.id === submitted)?.text ?? "(not answered)";
          }
          return (
            <div key={q.id} className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-sm font-medium">Q{i + 1} ({q.points} pt) · {isOpen ? "Open ended" : "Multiple choice"}</div>
              <div className="mt-1">{q.prompt}</div>
              <div className="mt-2 text-sm">
                <span className="text-[var(--muted)]">Trainee answer: </span>
                {isOpen ? (
                  <div className="mt-1 whitespace-pre-line rounded-lg bg-[var(--soft)] p-3">{submitted || <span className="italic text-[var(--muted)]">(no answer)</span>}</div>
                ) : (
                  <span>
                    {mcSubmittedText}{" "}
                    <span className={mcCorrect ? "text-mint" : "text-orange"}>· {mcCorrect ? "correct" : "wrong"}</span>
                  </span>
                )}
              </div>
              {isOpen && (
                <div className="mt-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!grades[q.id]}
                      onChange={(e) => setGrades((g) => ({ ...g, [q.id]: e.target.checked }))}
                    />
                    Award full points
                  </label>
                  {q.answers.filter((a) => a.isCorrect).length > 0 && (
                    <div className="text-xs text-[var(--muted)] mt-1">
                      Accepted answers: {q.answers.filter((a) => a.isCorrect).map((a) => `"${a.text}"`).join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <textarea className="gt-input mt-4 min-h-[60px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (optional)" />
      <button onClick={submit} disabled={submitting} className="gt-btn-primary mt-3">{submitting ? "Submitting…" : "Submit grading"}</button>
    </div>
  );
}
