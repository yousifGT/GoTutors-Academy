"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Candidate = { id: string; name: string; email: string; centre: string; position: string | null; alreadyEnrolled: boolean };

export function BulkEnrol({ courseId, candidates }: { courseId: string; candidates: Candidate[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      candidates.filter((c) =>
        !filter || (c.name + c.email + c.centre + (c.position ?? "")).toLowerCase().includes(filter.toLowerCase())
      ),
    [candidates, filter]
  );

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    const available = filtered.filter((c) => !c.alreadyEnrolled).map((c) => c.id);
    const allSelected = available.every((id) => selected.has(id));
    setSelected((s) => {
      const next = new Set(s);
      if (allSelected) available.forEach((id) => next.delete(id));
      else available.forEach((id) => next.add(id));
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/courses/${courseId}/bulk-enrol`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: Array.from(selected) }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "Failed");
    setSelected(new Set());
    setMsg(`Enrolled ${data.added}, skipped ${data.skipped}.`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input className="gt-input max-w-sm" placeholder="Search trainees…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button onClick={toggleAllVisible} className="gt-btn-ghost text-sm">Toggle all visible</button>
        <div className="ml-auto flex items-center gap-3">
          {msg && <span className="text-sm text-mint">{msg}</span>}
          <button onClick={submit} disabled={busy || selected.size === 0} className="gt-btn-primary">
            {busy ? "Enrolling…" : `Enrol ${selected.size} trainee${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
      <div className="gt-card overflow-hidden">
        <table className="gt-table">
          <thead><tr><th></th><th>Name</th><th>Centre</th><th>Position</th><th></th></tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className={c.alreadyEnrolled ? "opacity-60" : ""}>
                <td><input type="checkbox" disabled={c.alreadyEnrolled} checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                <td><div className="font-medium">{c.name}</div><div className="text-xs text-[var(--muted)]">{c.email}</div></td>
                <td>{c.centre}</td>
                <td>{c.position ?? "—"}</td>
                <td>{c.alreadyEnrolled ? <span className="gt-badge bg-mint/20 text-mint">Enrolled</span> : null}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-[var(--muted)]">No candidates.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
