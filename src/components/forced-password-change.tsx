"use client";
import { useRouter } from "next/navigation";
import { PasswordChangeForm } from "@/components/password-change-form";

/**
 * The forced variant: on success, move them straight on to their dashboard.
 *
 * `refresh()` before navigating matters — the middleware decides from the session
 * token, which only re-reads the flag periodically, so without it the redirect
 * can bounce straight back to this screen.
 */
export function ForcedPasswordChange({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  return (
    <PasswordChangeForm
      autoFocus
      onDone={() => {
        router.refresh();
        router.replace(redirectTo);
      }}
    />
  );
}
