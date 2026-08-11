import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { roleDashboard } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { ForcedPasswordChange } from "@/components/forced-password-change";

/**
 * The hold screen after an admin has reset someone's password.
 *
 * Middleware sends every page here while `mustChangePassword` is set, so this
 * route deliberately sits outside the role layouts — there is no sidebar to
 * escape through, and it doesn't need to know which dashboard they belong to
 * until they're released.
 */
export default async function ChangePasswordPage() {
  const session = await requireSession();
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true },
  });

  // Nothing to force: someone navigating here directly goes back to their own
  // dashboard rather than being shown a screen that implies a problem.
  if (!me?.mustChangePassword) redirect(roleDashboard[session.user.roleType]);

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--bg)] p-6">
      <div className="w-full max-w-lg space-y-5">
        <Logo />
        <div className="gt-card space-y-4 p-6">
          <div>
            <h1 className="text-2xl font-bold">Choose a new password</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Your current password was set for you by an administrator, so someone else knows it.
              Pick your own to carry on.
            </p>
          </div>
          <ForcedPasswordChange redirectTo={roleDashboard[session.user.roleType]} />
        </div>
      </div>
    </div>
  );
}
