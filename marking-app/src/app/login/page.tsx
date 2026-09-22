import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/");

  // A fresh installation has nowhere to sign in to yet, so send the first
  // visitor to setup rather than to a login form nobody can pass.
  if ((await prisma.user.count()) === 0) redirect("/setup");

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="card w-full max-w-sm">
        <div className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-sky/15 text-sky">🖊️</span>
          Marker
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">AI marking for tutoring centres.</p>
        <LoginForm />
      </div>
    </div>
  );
}
