"use client";

import { signOut } from "next-auth/react";

export function SignOut() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="mt-1 text-xs font-medium text-sky-600 underline"
    >
      Sign out
    </button>
  );
}
