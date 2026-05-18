"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function TraineeRowActions({ userId, active, editHref }: { userId: string; active: boolean; editHref?: string }) {
  const router = useRouter();
  async function remove() {
    if (!confirm("Remove this user?")) return;
    await fetch(`/api/users/${userId}`, { method: "DELETE" });
    router.refresh();
  }
  async function toggle() {
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    router.refresh();
  }
  return (
    <div className="flex justify-end gap-2 items-center">
      {editHref && <Link href={editHref} className="text-xs text-picton">Edit</Link>}
      <button onClick={toggle} className="text-xs text-picton">{active ? "Deactivate" : "Activate"}</button>
      <button onClick={remove} className="text-xs text-orange">Remove</button>
    </div>
  );
}
