import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Forgotten password" };

export default function ForgotPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <Wordmark className="text-2xl" />
        <h1 className="mt-1 text-sm font-medium text-slate-500">Forgotten password</h1>
        <ForgotForm />
        <p className="mt-6 text-sm text-slate-500">
          <Link href="/login" className="font-medium text-sky-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
