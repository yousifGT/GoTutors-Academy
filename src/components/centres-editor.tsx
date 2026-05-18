"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CentresEditor({ centres }: { centres: { id: string; name: string; location: string; users: number }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  async function add() {
    if (!name) return;
    await fetch("/api/centres", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, location }),
    });
    setName(""); setLocation("");
    router.refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this centre?")) return;
    await fetch(`/api/centres/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="gt-card p-5">
        <h3 className="font-bold mb-2">Add a centre</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <input className="gt-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="gt-input" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
          <button onClick={add} className="gt-btn-primary">Add</button>
        </div>
      </div>
      <div className="gt-card overflow-hidden">
        <table className="gt-table">
          <thead><tr><th>Name</th><th>Location</th><th>Users</th><th></th></tr></thead>
          <tbody>
            {centres.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td><td>{c.location || "—"}</td><td>{c.users}</td>
                <td className="text-right"><button onClick={() => remove(c.id)} className="text-xs text-orange">Delete</button></td>
              </tr>
            ))}
            {centres.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-[var(--muted)]">No centres yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
