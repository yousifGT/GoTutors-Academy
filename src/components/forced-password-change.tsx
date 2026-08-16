"use client";
import { useRouter } from "next/navigation";
import { getSession } from "next-auth/react";
import { PasswordChangeForm } from "@/components/password-change-form";

/**
 * The forced variant: on success, move them straight on to their dashboard.
 *
 * getSession() before navigating is load-bearing, not a nicety. Middleware only
 * DECODES the session cookie — the jwt callback doesn't run there — so the
 * cookie still carries mustChangePassword until a NextAuth endpoint rewrites it.
 * Without this the user changes their password successfully and is then bounced
 * straight back to this screen. Calling getSession() hits /api/auth/session,
 * which runs the callback, re-reads the cleared flag and reissues the cookie.
 */
export function ForcedPasswordChange({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  return (
    <PasswordChangeForm
      autoFocus
      onDone={async () => {
        await getSession();
        router.replace(redirectTo);
      }}
    />
  );
}
