"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "@/lib/client";

export type TutorOption = { id: string; name: string };

/**
 * Add a student, and edit the ones already here.
 *
 * The admission number comes first because it is the field that matters: it is
 * the centre's own reference, it is what gets typed on a paper, and it is how
 * anybody finds this child again.
 *
 * Deactivate is offered before delete, and delete says out loud what it takes
 * with it — a student's marked papers are the record of a child's work, and
 * there is no way to get them back.
 */
export function StudentsManager({
  tutors,
  canAssignTutor,
  currentUserId,
}: {
  tutors: TutorOption[];
  canAssignTutor: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [name, setName] = useState("");
  const [yearGroup, setYearGroup] = useState("");
  const [tutorId, setTutorId] = useState(currentUserId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!admissionNumber.trim()) return setError("An admission number is required.");
    if (!name.trim()) return setError("A name is required.");
    setSaving(true);
    setError(null);
    const result = await sendJson("/api/students", "POST", {
      admissionNumber,
      name,
      yearGroup: yearGroup || null,
      ...(canAssignTutor ? { tutorId } : {}),
    });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    setAdmissionNumber("");
    setName("");
    setYearGroup("");
    router.refresh();
  }

  return (
    <div className="card space-y-3">
      <h3 className="font-bold">Add a student</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr_auto]">
        <input
          className="input"
          placeholder="Admission number"
          value={admissionNumber}
          onChange={(e) => setAdmissionNumber(e.target.value)}
        />
        <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          className="input"
          placeholder="Year group (optional)"
          value={yearGroup}
          onChange={(e) => setYearGroup(e.target.value)}
        />
        <button onClick={add} disabled={saving} className="btn-primary">
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
      {canAssignTutor && (
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Tutor</span>
          <select className="input mt-1" value={tutorId} onChange={(e) => setTutorId(e.target.value)}>
            {tutors.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <div className="text-sm text-coral">{error}</div>}
    </div>
  );
}

export function StudentActions({
  studentId,
  active,
  paperCount,
}: {
  studentId: string;
  active: boolean;
  paperCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "PATCH" | "DELETE", body?: unknown) {
    setBusy(true);
    setError(null);
    const result = await sendJson(`/api/students/${studentId}`, method, body);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setConfirming(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-ghost text-xs" disabled={busy} onClick={() => send("PATCH", { active: !active })}>
        {active ? "Deactivate" : "Reactivate"}
      </button>
      {confirming ? (
        <>
          <span className="text-xs text-coral">
            Delete {paperCount > 0 ? `and lose ${paperCount} marked paper${paperCount === 1 ? "" : "s"}` : "permanently"}?
          </span>
          <button className="btn-danger text-xs" disabled={busy} onClick={() => send("DELETE")}>
            Yes, delete
          </button>
          <button className="btn-ghost text-xs" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button className="btn-ghost text-xs" onClick={() => setConfirming(true)}>
          Delete
        </button>
      )}
      {error && <span className="text-xs text-coral">{error}</span>}
    </div>
  );
}
