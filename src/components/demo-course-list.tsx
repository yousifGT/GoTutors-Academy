"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type DemoCourse = {
  id: string;
  title: string;
  description: string | null;
  published: boolean;
  modules: number;
  enrollments: number;
  audience: string[]; // compact lines, e.g. "Trainee — Maths Tutor, English Tutor +2 more"
};

type Filter = "all" | "published" | "draft";

/** Interactive course list for the demo: search, status filter, quick actions. */
export function DemoCourseList({ courses }: { courses: DemoCourse[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: courses.length,
      published: courses.filter((c) => c.published).length,
      draft: courses.filter((c) => !c.published).length,
    }),
    [courses]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courses.filter((c) => {
      if (filter === "published" && !c.published) return false;
      if (filter === "draft" && c.published) return false;
      if (q && !c.title.toLowerCase().includes(q) && !(c.description ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [courses, query, filter]);

  async function togglePublish(c: DemoCourse) {
    setBusyId(c.id);
    const res = await fetch(`/api/courses/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ published: !c.published }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return alert(data.error ?? "Could not update the course.");
    }
    router.refresh();
  }

  async function duplicate(c: DemoCourse) {
    setBusyId(c.id);
    const res = await fetch(`/api/courses/${c.id}/duplicate`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return alert(data.error ?? "Could not duplicate the course.");
    }
    router.refresh();
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "published", label: `Published (${counts.published})` },
    { key: "draft", label: `Drafts (${counts.draft})` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="gt-input max-w-xs"
          placeholder="Search courses…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                filter === f.key ? "bg-navy text-white" : "bg-[var(--soft)] hover:opacity-80"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Link href="/instructor/courses/demo/new" className="gt-btn-primary ml-auto">+ New course</Link>
      </div>

      {visible.length === 0 ? (
        <div className="gt-card p-8 text-center text-[var(--muted)]">
          {courses.length === 0 ? "No courses yet — create your first one." : "Nothing matches your search."}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => (
            <div key={c.id} className="gt-card p-5 flex flex-col hover:shadow-soft transition group">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/instructor/courses/demo/${c.id}/details`} className="text-lg font-bold hover:text-picton transition">
                  {c.title}
                </Link>
                <span className={`gt-badge shrink-0 ${c.published ? "bg-mint/20 text-mint" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
                  {c.published ? "Published" : "Draft"}
                </span>
              </div>
              {c.description && <p className="mt-1 text-sm text-[var(--muted)] line-clamp-1">{c.description}</p>}
              <div className="mt-3 space-y-0.5 text-sm">
                {c.audience.length === 0 ? (
                  <div className="text-orange">No audience assigned yet</div>
                ) : (
                  c.audience.map((line) => (
                    <div key={line} className="truncate text-[var(--muted)]">
                      For: <span className="text-[var(--fg)]">{line}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 text-xs text-[var(--muted)]">
                {c.modules} module{c.modules === 1 ? "" : "s"} · {c.enrollments} enrolment{c.enrollments === 1 ? "" : "s"}
              </div>
              <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-3">
                <Link href={`/instructor/courses/demo/${c.id}/curriculum`} className="gt-btn-ghost text-xs">Edit</Link>
                <button
                  onClick={() => togglePublish(c)}
                  disabled={busyId === c.id}
                  className={`text-xs ${c.published ? "gt-btn-ghost" : "gt-btn-primary"}`}
                >
                  {busyId === c.id ? "…" : c.published ? "Unpublish" : "Publish"}
                </button>
                <button onClick={() => duplicate(c)} disabled={busyId === c.id} className="gt-btn-ghost text-xs ml-auto">
                  Duplicate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
