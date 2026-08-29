"use client";

import { signOut } from "next-auth/react";

export function SignOut() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="font-medium text-sky-600"
    >
      Sign out
    </button>
  );
}
