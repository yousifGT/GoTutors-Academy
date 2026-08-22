import { Suspense } from "react";
import { Wordmark } from "@/components/brand";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <Wordmark className="text-2xl" />
        <h1 className="mt-1 text-sm font-medium text-slate-500">Centre inspection</h1>
        {/* useSearchParams needs a boundary for the shell to prerender. */}
        <Suspense fallback={<div className="mt-6 h-56" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
