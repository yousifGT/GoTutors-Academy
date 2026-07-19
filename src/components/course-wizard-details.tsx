"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type SP = { id: string; name: string; roleId: string };

/** Clean pill toggle (no visible checkbox) used for roles and sub-positions. */
function Pill({
  selected,
  onToggle,
  children,
  tone = "navy",
}: {
  selected: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  tone?: "navy" | "magenta";
}) {
  const on = tone === "navy" ? "bg-navy text-white" : "bg-magenta text-white";
  return (
    <label
      className={`cursor-pointer select-none rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        selected ? `${on} shadow-soft` : "bg-[var(--soft)] text-[var(--fg)] hover:opacity-80"
      }`}
    >
      <input type="checkbox" className="sr-only" checked={selected} onChange={onToggle} />
      {selected ? "✓ " : ""}
      {children}
    </label>
  );
}

/**
 * Step 1 of the demo course wizard. Creates a draft (or updates one when
 * `initial` is set, so the Details step stays revisitable) and moves on to the
 * curriculum step. Publishing is an explicit decision on the review step.
 */
export function CourseWizardDetails({
  roles,
  allSubPositions,
  categories,
  availableCourses,
  initial,
}: {
  roles: { id: string; name: string; type: string }[];
  allSubPositions: SP[];
  /** Existing category names, offered as suggestions. */
  categories: string[];
  /** Other courses that can be picked as prerequisites (never includes this course). */
  availableCourses: { id: string; title: string }[];
  initial?: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    passThreshold: number;
    roleIds: string[];
    subPositions: string[];
    prerequisiteIds: string[];
  };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [passThreshold, setPassThreshold] = useState(initial?.passThreshold ?? 70);
  const [roleIds, setRoleIds] = useState<string[]>(initial?.roleIds ?? []);
  const [subPositions, setSubPositions] = useState<string[]>(initial?.subPositions ?? []);
  const [prerequisiteIds, setPrerequisiteIds] = useState<string[]>(initial?.prerequisiteIds ?? []);
  const [saving, setSaving] = useState(false);
  const [reach, setReach] = useState<number | null>(null);

  const traineeRoleIds = useMemo(
    () => roleIds.filter((id) => roles.find((r) => r.id === id)?.type === "TRAINEE"),
    [roleIds, roles]
  );
  const traineeRoleSelected = traineeRoleIds.length > 0;
  const availableSubs = useMemo(() => {
    const seen = new Set<string>();
    const out: SP[] = [];
    for (const s of allSubPositions) {
      if (!traineeRoleIds.includes(s.roleId)) continue;
      if (seen.has(s.name)) continue;
      seen.add(s.name);
      out.push(s);
    }
    return out;
  }, [allSubPositions, traineeRoleIds]);

  // Live audience preview — debounced count of trainees matching the selection.
  useEffect(() => {
    if (!traineeRoleSelected) {
      setReach(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch("/api/courses/reach", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ roleIds: traineeRoleIds, subPositions }),
        });
        if (res.ok) setReach((await res.json()).count ?? null);
      } catch {
        /* preview only */
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [traineeRoleSelected, JSON.stringify(traineeRoleIds), JSON.stringify(subPositions)]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleRole(id: string) {
    setRoleIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function toggleSub(value: string) {
    setSubPositions((s) => (s.includes(value) ? s.filter((x) => x !== value) : [...s, value]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(initial ? `/api/courses/${initial.id}` : "/api/courses", {
      method: initial ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        category: category.trim() || null,
        passThreshold: Number(passThreshold),
        roleIds,
        subPositions: traineeRoleSelected ? subPositions : [],
        prerequisiteIds,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return alert(data.error ?? "Failed");
    router.push(`/instructor/courses/${initial?.id ?? data.id}/curriculum`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="gt-card p-6 space-y-4">
        <div>
          <label className="gt-label">Title</label>
          <input className="gt-input text-lg" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Safeguarding Basics" required autoFocus />
        </div>
        <div>
          <label className="gt-label">Description <span className="text-[var(--muted)] font-normal">(optional)</span></label>
          <textarea className="gt-input min-h-[80px]" value={description ?? ""} onChange={(e) => setDescription(e.target.value)} placeholder="What will trainees learn?" />
        </div>
        <div>
          <label className="gt-label">Category <span className="text-[var(--muted)] font-normal">(optional)</span></label>
          <input
            className="gt-input max-w-xs"
            list="course-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Onboarding"
          />
          <datalist id="course-categories">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
          <p className="text-xs text-[var(--muted)] mt-1">Courses are grouped by category on the Courses page — pick an existing one or type a new name.</p>
        </div>
        <div>
          <label className="gt-label">Quiz pass threshold</label>
          <div className="flex items-center gap-3">
            <input
              type="range" min={1} max={100}
              className="w-48 accent-[#233b8f]"
              value={passThreshold}
              onChange={(e) => setPassThreshold(Number(e.target.value))}
            />
            <span className="w-14 text-sm font-semibold">{passThreshold}%</span>
          </div>
        </div>
      </div>

      <div className="gt-card p-6 space-y-4">
        <div>
          <label className="gt-label">Who is this course for?</label>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <Pill key={r.id} selected={roleIds.includes(r.id)} onToggle={() => toggleRole(r.id)}>
                {r.name}
              </Pill>
            ))}
          </div>
        </div>
        {traineeRoleSelected && (
          <div>
            <label className="gt-label">Trainee sub-positions</label>
            <div className="flex flex-wrap gap-2">
              {availableSubs.map((s) => (
                <Pill key={s.id} selected={subPositions.includes(s.name)} onToggle={() => toggleSub(s.name)} tone="magenta">
                  {s.name}
                </Pill>
              ))}
            </div>
            <p className="text-xs text-[var(--muted)] mt-2">Leave all unticked to include every trainee regardless of sub-position.</p>
          </div>
        )}
        {traineeRoleSelected && reach !== null && (
          <div className="rounded-xl bg-picton/10 border border-picton/30 px-4 py-2.5 text-sm">
            <b>{reach}</b> trainee{reach === 1 ? "" : "s"} currently match{reach === 1 ? "es" : ""} this audience — they&apos;ll be enrolled automatically when you publish.
          </div>
        )}
      </div>

      {availableCourses.length > 0 && (
        <div className="gt-card p-6 space-y-3">
          <div>
            <label className="gt-label">Prerequisites <span className="text-[var(--muted)] font-normal">(optional)</span></label>
            <p className="text-xs text-[var(--muted)] mb-2">Trainees must complete these courses before they can start this one.</p>
            <div className="flex flex-wrap gap-2">
              {availableCourses.map((c) => (
                <Pill
                  key={c.id}
                  selected={prerequisiteIds.includes(c.id)}
                  onToggle={() =>
                    setPrerequisiteIds((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))
                  }
                >
                  {c.title}
                </Pill>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--muted)]">Saved as a draft — nothing reaches trainees until you publish on step 3.</span>
        <button disabled={saving} className="gt-btn-primary">
          {saving ? "Saving…" : "Save & continue →"}
        </button>
      </div>
    </form>
  );
}
