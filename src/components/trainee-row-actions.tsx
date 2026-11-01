"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Edit / deactivate / remove for one person in a directory.
 *
 * `can` comes from the viewer's permissions (userActionsFor): Edit and
 * Deactivate save through PATCH /api/users/[id], which needs "Edit users";
 * Remove is DELETE, which needs "Delete users". These were offered to everyone
 * and the reply was ignored, so a refused action simply did nothing on screen.
 */
export function TraineeRowActions({
  userId,
  active,
  editHref,
  can,
}: {
  userId: string;
  active: boolean;
  editHref?: string;
  can: { edit: boolean; delete: boolean };
}) {
  const router = useRouter();
  async function report(res: Response, fallback: string) {
    if (!res.ok) alert((await res.json().catch(() => ({})))?.error ?? fallback);
    router.refresh();
  }
  async function remove() {
    if (!confirm("Remove this user? This permanently deletes their account, enrolments and progress.")) return;
    await report(await fetch(`/api/users/${userId}`, { method: "DELETE" }), "Could not remove this user.");
  }
  async function toggle() {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    await report(res, `Could not ${active ? "deactivate" : "activate"} this user.`);
  }
  if (!can.edit && !can.delete) return null;
  return (
    <div className="flex justify-end gap-2 items-center">
      {can.edit && editHref && <Link href={editHref} className="gt-btn-ghost text-xs">Edit</Link>}
      {can.edit && <button onClick={toggle} className="gt-btn-ghost text-xs">{active ? "Deactivate" : "Activate"}</button>}
      {can.delete && <button onClick={remove} className="px-1 text-xs text-[var(--muted)] transition hover:text-orange">Remove</button>}
    </div>
  );
}
