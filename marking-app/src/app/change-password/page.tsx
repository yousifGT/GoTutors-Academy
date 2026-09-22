import { requireViewer } from "@/lib/session";
import { PasswordForm } from "@/components/password-form";

/**
 * The forced-change screen.
 *
 * The middleware holds anyone with `mustChangePassword` here, so the only way
 * out is the form — and the form leaves with a full page load, because a soft
 * navigation can be served from a router cache that still holds the redirect.
 */
export default async function ChangePasswordPage() {
  const viewer = await requireViewer();

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="card w-full max-w-md">
        <h1 className="text-xl font-bold">Choose your own password</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          You are signed in as {viewer.email}. Your current password was set by someone else, so pick your own before
          carrying on.
        </p>
        <PasswordForm afterChange="/" />
      </div>
    </div>
  );
}
