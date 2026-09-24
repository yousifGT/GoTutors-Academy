"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJson } from "@/lib/client";

export type Member = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MARKER";
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
};

/**
 * Adding people, and changing what they can do.
 *
 * A new account's temporary password is shown once, here, and never stored in
 * readable form — so it has to be copied now, and the person is forced to
 * change it at first sign-in.
 */
export function TeamManager({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MARKER">("MARKER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const result = await sendJson<{ temporaryPassword: string }>("/api/team", "POST", { name, email, role });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setIssued({ email, password: result.data.temporaryPassword });
    setName("");
    setEmail("");
    router.refresh();
  }

  async function patch(id: string, payload: Record<string, unknown>, theirEmail: string) {
    setBusy(true);
    setError(null);
    const result = await sendJson<{ temporaryPassword?: string }>(`/api/team/${id}`, "PATCH", payload);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (result.data.temporaryPassword) setIssued({ email: theirEmail, password: result.data.temporaryPassword });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-3">
        <h3 className="font-bold">Add someone</h3>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto]">
          <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            className="input"
            type="email"
            placeholder="name@centre.example"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "MARKER")}>
            <option value="MARKER">Marker</option>
            <option value="ADMIN">Admin</option>
          </select>
          <button onClick={add} disabled={busy} className="btn-primary">
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
        <p className="text-xs text-[var(--muted)]">
          A marker sees their own students and their own uploads. An admin sees everything in the centre and manages the
          team.
        </p>
        {error && <div className="text-sm text-coral">{error}</div>}
      </div>

      {issued && (
        <div className="card border-teal/40 bg-teal/5">
          <div className="font-bold">Temporary password for {issued.email}</div>
          <div className="mt-2 rounded-lg bg-[var(--surface)] px-3 py-2 font-mono text-lg">{issued.password}</div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Copy this now — it is not stored anywhere readable and cannot be shown again. They will be asked to change it
            when they first sign in.
          </p>
          <button onClick={() => setIssued(null)} className="btn-ghost mt-3 text-sm">
            Done
          </button>
        </div>
      )}

      <div className="card p-0">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Last signed in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className={m.active ? "" : "opacity-60"}>
                  <td>
                    <div className="font-medium">
                      {m.name}
                      {m.id === currentUserId && <span className="ml-2 text-xs text-[var(--muted)]">(you)</span>}
                    </div>
                    <div className="text-xs text-[var(--muted)]">{m.email}</div>
                  </td>
                  <td>
                    <span className={`badge ${m.role === "ADMIN" ? "bg-plum/15 text-plum" : "bg-sky/15 text-sky"}`}>
                      {m.role === "ADMIN" ? "Admin" : "Marker"}
                    </span>
                    {!m.active && <span className="badge ml-2 bg-[var(--soft)] text-[var(--muted)]">Inactive</span>}
                    {m.mustChangePassword && (
                      <span className="badge ml-2 bg-amber/15 text-amber">Password not set</span>
                    )}
                  </td>
                  <td className="text-[var(--muted)]">
                    {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleDateString("en-GB") : "never"}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn-ghost text-xs"
                        disabled={busy}
                        onClick={() => patch(m.id, { role: m.role === "ADMIN" ? "MARKER" : "ADMIN" }, m.email)}
                      >
                        Make {m.role === "ADMIN" ? "marker" : "admin"}
                      </button>
                      <button
                        className="btn-ghost text-xs"
                        disabled={busy}
                        onClick={() => patch(m.id, { resetPassword: true }, m.email)}
                      >
                        Reset password
                      </button>
                      <button
                        className="btn-ghost text-xs"
                        disabled={busy || m.id === currentUserId}
                        onClick={() => patch(m.id, { active: !m.active }, m.email)}
                      >
                        {m.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
