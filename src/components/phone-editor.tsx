"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Self-service phone number on the profile page — the one field users may edit themselves. */
export function PhoneEditor({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: phone.trim() || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return setError(data.error ?? "Could not save");
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span>{initial || <span className="text-[var(--muted)]">Not set</span>}</span>
        <button type="button" onClick={() => { setPhone(initial ?? ""); setEditing(true); }} className="gt-btn-ghost text-xs">
          {initial ? "Edit" : "Add"}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="tel"
        className="gt-input max-w-[14rem]"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+44 7xxx xxxxxx"
        autoFocus
      />
      <button type="button" onClick={save} disabled={saving} className="gt-btn-primary text-sm">{saving ? "…" : "Save"}</button>
      <button type="button" onClick={() => { setEditing(false); setError(null); }} className="gt-btn-ghost text-sm">Cancel</button>
      {error && <span className="text-xs text-orange">{error}</span>}
    </div>
  );
}
