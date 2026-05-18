"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Lesson = {
  id: string;
  title: string;
  order: number;
  video: { provider: string; url: string } | null;
  quiz: { id: string; passThreshold: number; retryLimit: number; questionsCount: number } | null;
};
type Module = { id: string; title: string; order: number; lessons: Lesson[] };

function swap<T>(arr: T[], i: number, j: number): T[] {
  if (i < 0 || j < 0 || i >= arr.length || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

export function ModuleEditor({ courseId, modules: initialModules }: { courseId: string; modules: Module[] }) {
  const router = useRouter();
  const [modules, setModules] = useState<Module[]>(initialModules);
  const [newModule, setNewModule] = useState("");
  const [pending, setPending] = useState(false);

  async function persistOrder(next: Module[]) {
    setPending(true);
    await fetch(`/api/courses/${courseId}/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        moduleIds: next.map((m) => m.id),
        lessonsByModule: Object.fromEntries(next.map((m) => [m.id, m.lessons.map((l) => l.id)])),
      }),
    });
    setPending(false);
    router.refresh();
  }

  function moveModule(idx: number, dir: -1 | 1) {
    const next = swap(modules, idx, idx + dir);
    setModules(next);
    persistOrder(next);
  }
  function moveLesson(mIdx: number, lIdx: number, dir: -1 | 1) {
    const next = modules.map((m, i) => i === mIdx ? { ...m, lessons: swap(m.lessons, lIdx, lIdx + dir) } : m);
    setModules(next);
    persistOrder(next);
  }

  async function addModule() {
    if (!newModule.trim()) return;
    await fetch(`/api/courses/${courseId}/modules`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: newModule.trim() }),
    });
    setNewModule("");
    router.refresh();
  }

  async function addLesson(moduleId: string, title: string) {
    if (!title.trim()) return;
    await fetch(`/api/modules/${moduleId}/lessons`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });
    router.refresh();
  }

  async function deleteModule(moduleId: string) {
    if (!confirm("Delete this module and all its lessons?")) return;
    await fetch(`/api/modules/${moduleId}`, { method: "DELETE" });
    router.refresh();
  }
  async function deleteLesson(lessonId: string) {
    if (!confirm("Delete this lesson, its video, quiz and all trainee progress for it?")) return;
    await fetch(`/api/lessons/${lessonId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {modules.map((m, mi) => (
        <div key={m.id} className="gt-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="font-bold">Module {mi + 1}: {m.title}</div>
            <div className="flex items-center gap-2">
              <button disabled={pending || mi === 0} onClick={() => moveModule(mi, -1)} className="text-xs text-picton disabled:text-[var(--muted)]">↑</button>
              <button disabled={pending || mi === modules.length - 1} onClick={() => moveModule(mi, 1)} className="text-xs text-picton disabled:text-[var(--muted)]">↓</button>
              <button onClick={() => deleteModule(m.id)} className="text-xs text-orange">Delete</button>
            </div>
          </div>
          <ol className="mt-3 divide-y divide-[var(--border)]">
            {m.lessons.map((l, li) => (
              <li key={l.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{mi + 1}.{li + 1} {l.title}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {l.video ? `${l.video.provider}` : "no video"} · {l.quiz ? `${l.quiz.questionsCount} questions, pass ${l.quiz.passThreshold}%` : "no quiz"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button disabled={pending || li === 0} onClick={() => moveLesson(mi, li, -1)} className="text-xs text-picton disabled:text-[var(--muted)]">↑</button>
                  <button disabled={pending || li === m.lessons.length - 1} onClick={() => moveLesson(mi, li, 1)} className="text-xs text-picton disabled:text-[var(--muted)]">↓</button>
                  <Link href={`/instructor/courses/${courseId}/lessons/${l.id}`} className="gt-btn-ghost text-sm">Edit</Link>
                  <button onClick={() => deleteLesson(l.id)} className="text-xs text-orange">Delete</button>
                </div>
              </li>
            ))}
          </ol>
          <AddLessonRow onAdd={(t) => addLesson(m.id, t)} />
        </div>
      ))}

      <div className="gt-card p-5">
        <label className="gt-label">Add a module</label>
        <div className="flex gap-2">
          <input className="gt-input" value={newModule} onChange={(e) => setNewModule(e.target.value)} placeholder="Module title" />
          <button onClick={addModule} className="gt-btn-primary">Add</button>
        </div>
      </div>
    </div>
  );
}

function AddLessonRow({ onAdd }: { onAdd: (title: string) => void }) {
  const [t, setT] = useState("");
  return (
    <div className="mt-3 flex gap-2">
      <input className="gt-input" value={t} onChange={(e) => setT(e.target.value)} placeholder="New lesson title" />
      <button onClick={() => { onAdd(t); setT(""); }} className="gt-btn-ghost">Add lesson</button>
    </div>
  );
}
