"use client";
import { ReactNode, useState } from "react";
import { UserOverviewModal } from "@/components/user-overview-modal";

/** Wraps any content in a click target that opens the user-overview popup. */
export function UserOverviewTrigger({ userId, children, className }: { userId: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? "block w-full text-left"} title="View profile">
        {children}
      </button>
      {open && <UserOverviewModal userId={userId} onClose={() => setOpen(false)} />}
    </>
  );
}
