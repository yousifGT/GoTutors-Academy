"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type SP = { id: string; name: string; roleId: string };

/**
 * Step 1 of the demo course wizard: details only. The course is always created
 * as a draft here — publishing is an explicit decision on the review step,
 * after the curriculum exists.
 */
export function CourseWizardDetails({
  roles,
  allSubPositions,
}: {
  roles: { id: string; name: string; type: string }[];
  allSubPositions: SP[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [passThreshold, setPassThreshold] = useState(70);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [subPositions, setSubPositions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

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

  function toggleRole(id: string) {
    setRoleIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function toggleSub(value: string) {
    setSubPositions((s) => (s.includes(value) ? s.filter((x) => x !== value) : [...s, value]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/courses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        passThreshold: Number(passThreshold),
        roleIds,
        subPositions: traineeRoleSelected ? subPositions : [],
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return alert(data.error ?? "Failed");
    router.push(`/instructor/courses/demo/${data.id}/curriculum`);
  }

  return (
    <form onSubmit={submit} className="gt-card p-6 space-y-4">
      <div><label className="gt-label">Title</label><input className="gt-input" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
      <div><label className="gt-label">Description</label><textarea className="gt-input min-h-[100px]" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div>
        <label className="gt-label">Pass threshold (%)</label>
        <input type="number" min={1} max={100} className="gt-input max-w-[12rem]" value={passThreshold} onChange={(e) => setPassThreshold(Number(e.target.value))} />
      </div>
      <div>
        <label className="gt-label">Who is this course for?</label>
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
          <p className="text-xs text-[var(--muted)] mt-1">Trainees with any of these sub-positions are enrolled automatically when you publish (step 3).</p>
        </div>
      )}
      <button disabled={saving} className="gt-btn-primary">{saving ? "Saving…" : "Save & continue to curriculum →"}</button>
      <p className="text-xs text-[var(--muted)]">Saved as a draft — nothing is visible to trainees until you publish on the last step.</p>
    </form>
  );
}
