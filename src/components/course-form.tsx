"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type SP = { id: string; name: string; roleId: string };

export function CourseForm({
  roles,
  allSubPositions,
  initial,
}: {
  roles: { id: string; name: string; type: string }[];
  allSubPositions: SP[];
  initial?: {
    id: string;
    title: string;
    description?: string | null;
    passThreshold: number;
    published: boolean;
    roleIds: string[];
    subPositions: string[];
  };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [passThreshold, setPassThreshold] = useState(initial?.passThreshold ?? 70);
  const [roleIds, setRoleIds] = useState<string[]>(initial?.roleIds ?? []);
  const [subPositions, setSubPositions] = useState<string[]>(initial?.subPositions ?? []);
  const [published, setPublished] = useState(initial?.published ?? false);
  const [saving, setSaving] = useState(false);

  const traineeRoleIds = useMemo(
    () => roleIds.filter((id) => roles.find((r) => r.id === id)?.type === "TRAINEE"),
    [roleIds, roles]
  );
  const traineeRoleSelected = traineeRoleIds.length > 0;
  // Show union of sub-positions across all selected trainee-type roles. De-dup by name.
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

  function toggleRole(id: string) {
    setRoleIds((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }
  function toggleSub(value: string) {
    setSubPositions((s) => s.includes(value) ? s.filter((x) => x !== value) : [...s, value]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const url = initial ? `/api/courses/${initial.id}` : "/api/courses";
    const method = initial ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title, description, passThreshold: Number(passThreshold), published, roleIds,
        subPositions: traineeRoleSelected ? subPositions : [],
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return alert(data.error ?? "Failed");
    router.push(`/instructor/courses/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="gt-card p-6 space-y-4">
      <div><label className="gt-label">Title</label><input className="gt-input" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
      <div><label className="gt-label">Description</label><textarea className="gt-input min-h-[100px]" value={description ?? ""} onChange={(e) => setDescription(e.target.value)} /></div>
      <div>
        <label className="gt-label">Pass threshold (%)</label>
        <input type="number" min={1} max={100} className="gt-input max-w-[12rem]" value={passThreshold} onChange={(e) => setPassThreshold(Number(e.target.value))} />
      </div>
      <div>
        <label className="gt-label">Status</label>
        <div className="flex flex-wrap gap-2">
          <label className={`gt-badge cursor-pointer ${!published ? "bg-navy text-white" : "bg-[var(--soft)]"}`}>
            <input type="radio" name="course-status" className="mr-1" checked={!published} onChange={() => setPublished(false)} />
            Draft
          </label>
          <label className={`gt-badge cursor-pointer ${published ? "bg-navy text-white" : "bg-[var(--soft)]"}`}>
            <input type="radio" name="course-status" className="mr-1" checked={published} onChange={() => setPublished(true)} />
            Published
          </label>
        </div>
        <p className="text-xs text-[var(--muted)] mt-1">Drafts are hidden from trainees. Publishing automatically enrols every trainee matching the assigned sub-positions.</p>
      </div>
      <div>
        <label className="gt-label">Assigned roles</label>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <label key={r.id} className={`gt-badge cursor-pointer ${roleIds.includes(r.id) ? "bg-navy text-white" : "bg-[var(--soft)]"}`}>
              <input type="checkbox" className="mr-1" checked={roleIds.includes(r.id)} onChange={() => toggleRole(r.id)} />
              {r.name}
            </label>
          ))}
        </div>
      </div>
      {traineeRoleSelected && (
        <div>
          <label className="gt-label">Trainee sub-positions</label>
          <div className="flex flex-wrap gap-2">
            {availableSubs.map((s) => (
              <label key={s.id} className={`gt-badge cursor-pointer ${subPositions.includes(s.name) ? "bg-magenta text-white" : "bg-lavender text-magenta"}`}>
                <input type="checkbox" className="mr-1" checked={subPositions.includes(s.name)} onChange={() => toggleSub(s.name)} />
                {s.name}
              </label>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)] mt-1">Trainees with any of these sub-positions are enrolled automatically once the course is published.</p>
        </div>
      )}
      <button disabled={saving} className="gt-btn-primary">{saving ? "Saving…" : initial ? "Save changes" : published ? "Create & publish" : "Save as draft"}</button>
    </form>
  );
}
