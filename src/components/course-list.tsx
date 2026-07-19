"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/page-ui";

export type CourseCard = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  modules: number;
  enrollments: number;
  audience: string[]; // compact lines, e.g. "Trainee — Maths Tutor, English Tutor +2 more"
  /** Shown on the meta line when set (admin view across all instructors). */
  author?: string;
};

type Filter = "all" | "published" | "draft";
type SortMode = "custom" | "modified" | "created" | "name";
const UNCATEGORISED = "Uncategorised";
const SORT_STORAGE_KEY = "gt-courses-sort";

/**
 * Interactive course list: search, status filter, quick actions, and
 * category sections that work like folders — create one here and drag
 * course cards (by their ⠿ handle) between sections to re-categorise.
 */
export function CourseList({ courses }: { courses: CourseCard[] }) {
  const router = useRouter();
  const [items, setItems] = useState(courses);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Categories created here that have no courses yet (they persist once a course is dropped in).
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [sort, setSortState] = useState<SortMode>("custom");
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Re-sync with fresh server data after router.refresh().
  useEffect(() => setItems(courses), [courses]);
  // Remember the chosen sort across visits.
  useEffect(() => {
    const stored = localStorage.getItem(SORT_STORAGE_KEY) as SortMode | null;
    if (stored && ["custom", "modified", "created", "name"].includes(stored)) setSortState(stored);
  }, []);
  function changeSort(s: SortMode) {
    setSortState(s);
    localStorage.setItem(SORT_STORAGE_KEY, s);
  }

  const counts = useMemo(
    () => ({
      all: items.length,
      published: items.filter((c) => c.published).length,
      draft: items.filter((c) => !c.published).length,
    }),
    [items]
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = items.filter((c) => {
      if (filter === "published" && !c.published) return false;
      if (filter === "draft" && c.published) return false;
      if (
        q &&
        !c.title.toLowerCase().includes(q) &&
        !(c.description ?? "").toLowerCase().includes(q) &&
        !(c.category ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
    // "custom" keeps the items order (server: sortOrder, then last modified).
    if (sort === "modified") visible.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    else if (sort === "created") visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sort === "name") visible.sort((a, b) => a.title.localeCompare(b.title));
    const byCategory = new Map<string, CourseCard[]>();
    // Session-created empty categories stay visible as drop targets.
    for (const c of extraCategories) byCategory.set(c, []);
    for (const c of visible) {
      const key = c.category?.trim() || UNCATEGORISED;
      byCategory.set(key, [...(byCategory.get(key) ?? []), c]);
    }
    // While dragging, always offer Uncategorised so a category can be cleared.
    if (dragId && !byCategory.has(UNCATEGORISED)) byCategory.set(UNCATEGORISED, []);
    // Named categories alphabetically, Uncategorised last.
    return [...byCategory.entries()].sort(([a], [b]) => {
      if (a === UNCATEGORISED) return 1;
      if (b === UNCATEGORISED) return -1;
      return a.localeCompare(b);
    });
  }, [items, query, filter, extraCategories, dragId, sort]);

  const allCategoryNames = useMemo(
    () => new Set([...items.map((c) => c.category?.trim()).filter(Boolean), ...extraCategories].map((c) => (c as string).toLowerCase())),
    [items, extraCategories]
  );

  function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    if (name.toLowerCase() === UNCATEGORISED.toLowerCase() || allCategoryNames.has(name.toLowerCase())) {
      setNewCategory("");
      setAddingCategory(false);
      return;
    }
    setExtraCategories((s) => [...s, name]);
    setNewCategory("");
    setAddingCategory(false);
  }

  /** Live in-category reorder preview while dragging (custom sort only). */
  function onCardDragOver(e: React.DragEvent, target: CourseCard) {
    if (!dragId || sort !== "custom" || dragId === target.id) return;
    const dragged = itemsRef.current.find((c) => c.id === dragId);
    if (!dragged || (dragged.category?.trim() || null) !== (target.category?.trim() || null)) return;
    e.preventDefault();
    setItems((s) => {
      const from = s.findIndex((c) => c.id === dragId);
      const to = s.findIndex((c) => c.id === target.id);
      if (from < 0 || to < 0 || from === to) return s;
      const copy = [...s];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  }

  /** Persist the manual order (whole list — sortOrder is global, groups read it per category). */
  async function persistOrder() {
    const res = await fetch("/api/courses/sort", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseIds: itemsRef.current.map((c) => c.id) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Could not save the order.");
    }
    router.refresh();
  }

  async function moveToCategory(courseId: string, category: string | null) {
    const course = items.find((c) => c.id === courseId);
    if (!course || (course.category?.trim() || null) === category) return;
    setItems((s) => s.map((c) => (c.id === courseId ? { ...c, category } : c)));
    const res = await fetch(`/api/courses/${courseId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Could not move the course.");
    }
    router.refresh();
  }

  async function togglePublish(c: CourseCard) {
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

  async function duplicate(c: CourseCard) {
    setBusyId(c.id);
    const res = await fetch(`/api/courses/${c.id}/duplicate`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return alert(data.error ?? "Could not duplicate the course.");
    }
    router.refresh();
  }

  async function remove(c: CourseCard) {
    if (
      !confirm(
        `Delete “${c.title}”? This permanently removes its modules, lessons, quizzes, certificates and all trainee progress (${c.enrollments} enrolment${c.enrollments === 1 ? "" : "s"}). This cannot be undone.`
      )
    )
      return;
    setBusyId(c.id);
    const res = await fetch(`/api/courses/${c.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return alert(data.error ?? "Could not delete the course.");
    }
    router.refresh();
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "published", label: `Published (${counts.published})` },
    { key: "draft", label: `Drafts (${counts.draft})` },
  ];

  return (
    <div className="space-y-6">
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
        <label className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
          Sort
          <select
            className="gt-input w-auto py-1.5 text-sm"
            value={sort}
            onChange={(e) => changeSort(e.target.value as SortMode)}
          >
            <option value="custom">Custom order</option>
            <option value="modified">Last modified</option>
            <option value="created">Newest created</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          {addingCategory ? (
            <input
              autoFocus
              className="gt-input max-w-[12rem]"
              placeholder="Category name…"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addCategory();
                if (e.key === "Escape") { setNewCategory(""); setAddingCategory(false); }
              }}
              onBlur={() => { if (!newCategory.trim()) setAddingCategory(false); else addCategory(); }}
            />
          ) : (
            <button onClick={() => setAddingCategory(true)} className="gt-btn-ghost">+ New category</button>
          )}
          <Link href="/instructor/courses/new" className="gt-btn-primary">+ New course</Link>
        </div>
      </div>

      {groups.length === 0 &&
        (items.length === 0 ? (
          <EmptyState
            icon="📚"
            title="No courses yet"
            hint="Create your first course — the wizard walks you through details, curriculum and publishing."
            action={<Link href="/instructor/courses/new" className="gt-btn-primary">+ New course</Link>}
          />
        ) : (
          <EmptyState icon="🔍" title="Nothing matches your search" hint="Try a different title, description or category." />
        ))}

      {groups.map(([category, list]) => {
        const isTarget = dropTarget === category && dragId !== null;
        return (
          <section
            key={category}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              const dragged = itemsRef.current.find((c) => c.id === dragId);
              const targetKey = category === UNCATEGORISED ? null : category;
              const sameCategory = dragged && (dragged.category?.trim() || null) === targetKey;
              if (!sameCategory && dropTarget !== category) setDropTarget(category);
              if (sameCategory && dropTarget) setDropTarget(null);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              if (dropTarget === category) setDropTarget(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) {
                const dragged = itemsRef.current.find((c) => c.id === dragId);
                const targetKey = category === UNCATEGORISED ? null : category;
                if (dragged && (dragged.category?.trim() || null) === targetKey) {
                  // Dropped within its own category — save the manual order.
                  if (sort === "custom") persistOrder();
                } else {
                  moveToCategory(dragId, targetKey);
                }
              }
              setDragId(null);
              setDropTarget(null);
            }}
            className={`rounded-2xl p-3 -m-3 transition ${isTarget ? "bg-picton/10 ring-2 ring-picton" : ""}`}
          >
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[var(--muted)]">
              {category}
              <span className="rounded-full bg-[var(--soft)] px-2 py-0.5 text-xs font-semibold normal-case">{list.length}</span>
              {isTarget && <span className="text-xs font-normal normal-case text-picton">drop to move here</span>}
            </h3>
            {list.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
                Empty category — drag a course here{extraCategories.includes(category) ? " (it disappears on reload if left empty)" : ""}.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {list.map((c) => (
                  <div
                    key={c.id}
                    onDragOver={(e) => onCardDragOver(e, c)}
                    className={`gt-card p-5 flex flex-col hover:shadow-soft transition ${dragId === c.id ? "opacity-50 ring-2 ring-picton" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        draggable
                        onDragStart={() => setDragId(c.id)}
                        onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                        title="Drag to reorder (custom sort) or move to another category"
                        className="cursor-grab select-none text-[var(--muted)] hover:text-[var(--fg)] pt-1"
                      >
                        ⠿
                      </span>
                      <Link href={`/instructor/courses/${c.id}/details`} className="text-lg font-bold hover:text-picton transition">
                        {c.title}
                      </Link>
                      <span className={`gt-badge ml-auto shrink-0 ${c.published ? "bg-mint/15 text-mint" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
                        {c.published ? "Published" : "Draft"}
                      </span>
                    </div>
                    {c.description && <p className="mt-1 text-sm text-[var(--muted)] line-clamp-1">{c.description}</p>}
                    <div className="mt-3 space-y-0.5 text-sm">
                      {c.audience.length === 0 ? (
                        <div><span className="gt-badge bg-orange/15 text-orange">No audience assigned yet</span></div>
                      ) : (
                        c.audience.map((line) => (
                          <div key={line} className="truncate text-[var(--muted)]">
                            For: <span className="text-[var(--fg)]">{line}</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="mt-3 text-xs text-[var(--muted)]">
                      {c.author ? `by ${c.author} · ` : ""}{c.modules} module{c.modules === 1 ? "" : "s"} · {c.enrollments} enrolment{c.enrollments === 1 ? "" : "s"}
                    </div>
                    <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-3">
                      <Link href={`/instructor/courses/${c.id}/curriculum`} className="gt-btn-ghost text-xs">Edit</Link>
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
                      <button
                        onClick={() => remove(c)}
                        disabled={busyId === c.id}
                        className="text-xs text-[var(--muted)] hover:text-orange transition px-1"
                        title="Delete course"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
