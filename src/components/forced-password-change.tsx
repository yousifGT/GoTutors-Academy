"use client";
import { getSession } from "next-auth/react";
import { PasswordChangeForm } from "@/components/password-change-form";

/**
 * The forced variant: on success, move them straight on to their dashboard.
 *
 * Two things here are load-bearing, and both were learned the hard way.
 *
 * getSession() first: middleware only DECODES the session cookie — the jwt
 * callback doesn't run there — so the cookie still carries mustChangePassword
 * until a NextAuth endpoint rewrites it. Hitting /api/auth/session runs the
 * callback, re-reads the cleared flag and reissues the cookie.
 *
 * Then a FULL page load rather than router.replace(). Even with a correct
 * cookie, the soft navigation landed back on this screen: arriving here in the
 * first place means Next's client router already cached the middleware redirect
 * for the dashboard route, and replace() was served that cached result. A
 * browser-level navigation re-runs middleware against the fresh cookie with no
 * cache in the way. This happens once per user in their lifetime, so the cost of
 * a full reload is irrelevant next to the cost of it silently not working.
 */
export function ForcedPasswordChange({ redirectTo }: { redirectTo: string }) {
  return (
    <PasswordChangeForm
      autoFocus
      onDone={async () => {
        await getSession();
        window.location.assign(redirectTo);
      }}
    />
  );
}
