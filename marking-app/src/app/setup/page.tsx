import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SetupForm } from "@/components/setup-form";

export const dynamic = "force-dynamic";

/**
 * First run.
 *
 * Open, and exactly once: the moment any account exists this page sends you to
 * the login screen, and the route behind it refuses too — so an installation
 * that has been set up cannot have a second administrator conjured by anyone
 * who finds the URL.
 */
export default async function SetupPage() {
  if ((await prisma.user.count()) > 0) redirect("/login");

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="card w-full max-w-sm">
        <div className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-sky/15 text-sky">🖊️</span>
          Marker
        </div>
        <h1 className="mt-3 text-xl font-bold">Set up your centre</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          This runs once. You will be the first admin, and can add the rest of your team afterwards.
        </p>
        <SetupForm />
      </div>
    </div>
  );
}
