import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/format";
import { Wordmark } from "@/components/brand";
import { PasswordForm } from "./password-form";

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <main className="mx-auto max-w-lg p-6">
      <Link href="/">
        <Wordmark className="text-lg" />
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-navy">Your account</h1>
      <p className="mt-1 text-sm text-slate-500">
        {user.name} · {user.email} · {ROLE_LABEL[user.role] ?? user.role}
      </p>
      <PasswordForm />
      <Link href="/" className="mt-6 inline-block text-sm text-sky-600">
        ← Back to inspections
      </Link>
    </main>
  );
}
