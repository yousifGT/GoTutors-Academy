"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Lesson = {
  id: string;
  title: string;
  video: { provider: string } | null;
  quiz: { questionsCount: number; passThreshold: number } | null;
};
type Module = { id: string; title: string; lessons: Lesson[] };

type Drag =
  | { type: "module"; id: string }
  | { type: "lesson"; moduleId: string; id: string }
  | null;

/**
 * Interactive curriculum builder for the demo wizard: drag-and-drop reorder
 * (modules, and lessons within a module), inline renames, collapsible modules
 * and rapid-fire adding (Enter adds and keeps the input focused). All updates
 * are optimistic; the existing module/lesson/reorder APIs stay authoritative.
 */
export function DemoCurriculumBuilder({
  courseId,
  modules: initialModules,
}: {
  courseId: string;
  modules: Module[];
}) {
  const router = useRouter();
  const [modules, setModules] = useState<Module[]>(initialModules);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Drag>(null);
  const modulesRef = useRef(modules);
  modulesRef.current = modules;

  // Re-sync with fresh server data after router.refresh().
  useEffect(() => setModules(initialModules), [initialModules]);

  async function persistOrder() {
    const next = modulesRef.current;
    await fetch(`/api/courses/${courseId}/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        moduleIds: next.map((m) => m.id),
        lessonsByModule: Object.fromEntries(next.map((m) => [m.id, m.lessons.map((l) => l.id)])),
      }),
    });
    router.refresh();
  }

  function toggleCollapsed(id: string) {
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // --- drag & drop (live preview while hovering, persist on drop) ---
  function onModuleDragOver(e: React.DragEvent, overId: string) {
    if (drag?.type !== "module" || drag.id === overId) return;
    e.preventDefault();
    setModules((ms) => {
      const from = ms.findIndex((m) => m.id === drag.id);
      const to = ms.findIndex((m) => m.id === overId);
      if (from < 0 || to < 0 || from === to) return ms;
      const copy = [...ms];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  }
  function onLessonDragOver(e: React.DragEvent, moduleId: string, overId: string) {
    if (drag?.type !== "lesson" || drag.moduleId !== moduleId || drag.id === overId) return;
    e.preventDefault();
    setModules((ms) =>
      ms.map((m) => {
        if (m.id !== moduleId) return m;
        const from = m.lessons.findIndex((l) => l.id === drag.id);
        const to = m.lessons.findIndex((l) => l.id === overId);
        if (from < 0 || to < 0 || from === to) return m;
        const lessons = [...m.lessons];
        const [moved] = lessons.splice(from, 1);
        lessons.splice(to, 0, moved);
        return { ...m, lessons };
      })
    );
  }
  function onDragEnd() {
    if (drag) persistOrder();
    setDrag(null);
  }

  // --- mutations (optimistic + refresh) ---
  async function addModule(title: string) {
    const res = await fetch(`/api/courses/${courseId}/modules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return alert("Could not add the module.");
    const m = await res.json();
    setModules((ms) => [...ms, { id: m.id, title: m.title, lessons: [] }]);
    router.refresh();
  }
  async function addLesson(moduleId: string, title: string) {
    const res = await fetch(`/api/modules/${moduleId}/lessons`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return alert("Could not add the lesson.");
    const l = await res.json();
    setModules((ms) =>
      ms.map((m) => (m.id === moduleId ? { ...m, lessons: [...m.lessons, { id: l.id, title: l.title, video: null, quiz: null }] } : m))
    );
    router.refresh();
  }
  async function renameModule(id: string, title: string) {
    setModules((ms) => ms.map((m) => (m.id === id ? { ...m, title } : m)));
    await fetch(`/api/modules/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    router.refresh();
  }
  async function renameLesson(moduleId: string, id: string, title: string) {
    setModules((ms) => ms.map((m) => (m.id === moduleId ? { ...m, lessons: m.lessons.map((l) => (l.id === id ? { ...l, title } : l)) } : m)));
    await fetch(`/api/lessons/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    router.refresh();
  }
  async function deleteModule(id: string) {
    if (!confirm("Delete this module and all its lessons?")) return;
    setModules((ms) => ms.filter((m) => m.id !== id));
    await fetch(`/api/modules/${id}`, { method: "DELETE" });
    router.refresh();
  }
  async function deleteLesson(moduleId: string, id: string) {
    if (!confirm("Delete this lesson, its video, quiz and all trainee progress for it?")) return;
    setModules((ms) => ms.map((m) => (m.id === moduleId ? { ...m, lessons: m.lessons.filter((l) => l.id !== id) } : m)));
    await fetch(`/api/lessons/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {modules.length === 0 && (
        <div className="gt-card p-8 text-center text-[var(--muted)]">
          Start by adding your first module — e.g. “Week 1: Basics”.
        </div>
      )}

      {modules.map((m, mi) => {
        const isCollapsed = collapsed.has(m.id);
        const beingDragged = drag?.type === "module" && drag.id === m.id;
        return (
          <div
            key={m.id}
            onDragOver={(e) => onModuleDragOver(e, m.id)}
            className={`gt-card transition ${beingDragged ? "opacity-50 ring-2 ring-picton" : ""}`}
          >
            <div className="flex items-center gap-2 p-4">
              <span
                draggable
                onDragStart={() => setDrag({ type: "module", id: m.id })}
                onDragEnd={onDragEnd}
                title="Drag to reorder"
                className="cursor-grab select-none px-1 text-[var(--muted)] hover:text-[var(--fg)]"
              >
                ⠿
              </span>
              <button onClick={() => toggleCollapsed(m.id)} className="w-5 text-[var(--muted)] hover:text-[var(--fg)]" title={isCollapsed ? "Expand" : "Collapse"}>
                {isCollapsed ? "▸" : "▾"}
              </button>
              <span className="text-sm font-bold text-[var(--muted)] shrink-0">Module {mi + 1}</span>
              <InlineTitle value={m.title} onSave={(t) => renameModule(m.id, t)} className="font-bold" />
              <span className="ml-auto text-xs text-[var(--muted)] shrink-0">
                {m.lessons.length} lesson{m.lessons.length === 1 ? "" : "s"}
              </span>
              <button onClick={() => deleteModule(m.id)} className="text-xs text-orange hover:underline shrink-0">Delete</button>
            </div>

            {!isCollapsed && (
              <div className="px-4 pb-4">
                {m.lessons.length > 0 && (
                  <ol className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
                    {m.lessons.map((l, li) => {
                      const lDragged = drag?.type === "lesson" && drag.id === l.id;
                      return (
                        <li
                          key={l.id}
                          onDragOver={(e) => onLessonDragOver(e, m.id, l.id)}
                          className={`flex items-center gap-2 px-3 py-2.5 transition ${lDragged ? "opacity-50 bg-picton/10" : ""}`}
                        >
                          <span
                            draggable
                            onDragStart={() => setDrag({ type: "lesson", moduleId: m.id, id: l.id })}
                            onDragEnd={onDragEnd}
                            title="Drag to reorder"
                            className="cursor-grab select-none px-1 text-[var(--muted)] hover:text-[var(--fg)]"
                          >
                            ⠿
                          </span>
                          <span className="text-xs text-[var(--muted)] w-8 shrink-0">{mi + 1}.{li + 1}</span>
                          <InlineTitle value={l.title} onSave={(t) => renameLesson(m.id, l.id, t)} />
                          <span className="ml-auto flex items-center gap-1.5 shrink-0">
                            {l.video ? (
                              <span className="gt-badge bg-picton/15 text-picton">🎬 {l.video.provider.toLowerCase()}</span>
                            ) : (
                              <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">no video</span>
                            )}
                            {l.quiz ? (
                              <span className="gt-badge bg-mint/15 text-mint">📝 {l.quiz.questionsCount} Qs</span>
                            ) : (
                              <span className="gt-badge bg-[var(--soft)] text-[var(--muted)]">no quiz</span>
                            )}
                          </span>
                          <Link href={`/instructor/courses/${courseId}/lessons/${l.id}`} className="gt-btn-ghost text-xs shrink-0">
                            Content →
                          </Link>
                          <button onClick={() => deleteLesson(m.id, l.id)} className="px-1 text-[var(--muted)] hover:text-orange shrink-0" title="Delete lesson">
                            ✕
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <InlineAdd placeholder="Lesson title — Enter to add another, Esc to finish" label="+ Add lesson" onAdd={(t) => addLesson(m.id, t)} />
              </div>
            )}
          </div>
        );
      })}

      <InlineAdd placeholder="Module title — Enter to add another, Esc to finish" label="+ Add module" onAdd={addModule} big />
    </div>
  );
}

/** Click-to-edit title; Enter saves, Esc cancels, blur saves. */
function InlineTitle({ value, onSave, className = "" }: { value: string; onSave: (t: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);

  function commit() {
    setEditing(false);
    const t = v.trim();
    if (t && t !== value) onSave(t);
    else setV(value);
  }
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to rename"
        className={`truncate rounded px-1 text-left hover:bg-[var(--soft)] transition ${className}`}
      >
        {value}
      </button>
    );
  }
  return (
    <input
      autoFocus
      className="gt-input py-1 max-w-md"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { setV(value); setEditing(false); }
      }}
    />
  );
}

/** Dashed "+ Add …" button that turns into an input. Enter adds and keeps focus for rapid entry. */
function InlineAdd({ label, placeholder, onAdd, big = false }: { label: string; placeholder: string; onAdd: (t: string) => void; big?: boolean }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--muted)] transition hover:border-picton hover:text-[var(--fg)] ${big ? "py-4" : "mt-2 py-2"}`}
      >
        {label}
      </button>
    );
  }
  return (
    <div className={big ? "" : "mt-2"}>
      <input
        autoFocus
        className="gt-input"
        placeholder={placeholder}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const t = v.trim();
            if (t) { onAdd(t); setV(""); }
          }
          if (e.key === "Escape") { setV(""); setOpen(false); }
        }}
        onBlur={() => { if (!v.trim()) setOpen(false); }}
      />
    </div>
  );
}
