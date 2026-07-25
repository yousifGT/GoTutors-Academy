"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "edit" | "admin" | "instructor";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="gt-modal-backdrop fixed inset-0 z-50 grid place-items-center bg-navy/70 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true">
      <div className="gt-modal-panel gt-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold tracking-tight">{title}</h3>
          <button onClick={onClose} className="gt-btn-ghost px-2.5 text-sm" aria-label="Close">✕</button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function CentreManageBar({
  centreId,
  name,
  location,
  centreAdminRoleId,
  instructorRoleId,
}: {
  centreId: string;
  name: string;
  location: string;
  centreAdminRoleId: string | null;
  instructorRoleId: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Edit centre fields
  const [editName, setEditName] = useState(name);
  const [editLocation, setEditLocation] = useState(location);

  // New-user fields (shared by admin + instructor modals)
  const [uName, setUName] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uPassword, setUPassword] = useState("");

  function open(m: Mode) {
    setErr(null);
    if (m === "edit") { setEditName(name); setEditLocation(location); }
    else { setUName(""); setUEmail(""); setUPassword(""); }
    setMode(m);
  }

  async function saveCentre() {
    if (!editName.trim()) return setErr("Name is required");
    setBusy(true); setErr(null);
    const res = await fetch(`/api/centres/${centreId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), location: editLocation.trim() }),
    });
    setBusy(false);
    if (!res.ok) return setErr((await res.json().catch(() => ({})))?.error ?? "Failed to save");
    setMode(null);
    router.refresh();
  }

  async function createUser(roleId: string | null, label: string) {
    if (!roleId) return setErr(`No ${label} role exists — create one under Roles & sub-positions first.`);
    if (!uName.trim() || !uEmail.trim() || uPassword.length < 8) {
      return setErr("Name, email and a password of 8+ characters are all required");
    }
    setBusy(true); setErr(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: uName.trim(), email: uEmail.trim(), password: uPassword, roleId, centreId }),
    });
    setBusy(false);
    if (!res.ok) return setErr((await res.json().catch(() => ({})))?.error ?? "Failed to create");
    setMode(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => open("edit")} className="gt-btn-ghost text-sm">✏️ Edit centre</button>
        <button onClick={() => open("admin")} className="gt-btn-ghost text-sm">＋ Add centre admin</button>
        <button onClick={() => open("instructor")} className="gt-btn-ghost text-sm">＋ Add instructor</button>
      </div>

      {mode === "edit" && (
        <Modal title="Edit centre" onClose={() => setMode(null)}>
          <div className="space-y-3">
            <div>
              <label className="gt-label">Name</label>
              <input autoFocus className="gt-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="gt-label">Location</label>
              <input className="gt-input" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="City / address" />
            </div>
            {err && <p className="text-sm text-orange">⚠ {err}</p>}
            <div className="flex gap-2">
              <button onClick={saveCentre} disabled={busy} className="gt-btn-primary">{busy ? "Saving…" : "Save"}</button>
              <button onClick={() => setMode(null)} className="gt-btn-ghost">Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {(mode === "admin" || mode === "instructor") && (
        <Modal title={mode === "admin" ? "Add centre admin" : "Add instructor"} onClose={() => setMode(null)}>
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)]">
              {mode === "admin"
                ? "This person can log in and manage this centre's trainees."
                : "An instructor can author courses and review this centre's trainees."}{" "}
              Share the password with them; they can change it later.
            </p>
            <div>
              <label className="gt-label">Full name</label>
              <input autoFocus className="gt-input" value={uName} onChange={(e) => setUName(e.target.value)} />
            </div>
            <div>
              <label className="gt-label">Email</label>
              <input type="email" className="gt-input" value={uEmail} onChange={(e) => setUEmail(e.target.value)} placeholder="name@gotutors.example" />
            </div>
            <div>
              <label className="gt-label">Initial password</label>
              <input className="gt-input" value={uPassword} onChange={(e) => setUPassword(e.target.value)} placeholder="8+ characters" />
            </div>
            {err && <p className="text-sm text-orange">⚠ {err}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => (mode === "admin" ? createUser(centreAdminRoleId, "Centre Admin") : createUser(instructorRoleId, "Instructor"))}
                disabled={busy}
                className="gt-btn-primary"
              >
                {busy ? "Creating…" : mode === "admin" ? "Create admin" : "Create instructor"}
              </button>
              <button onClick={() => setMode(null)} className="gt-btn-ghost">Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
