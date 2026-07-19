"use client";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const roleRedirect: Record<string, string> = {
  SUPER_ADMIN: "/admin",
  CENTRE_ADMIN: "/centre",
  INSTRUCTOR: "/instructor",
  TRAINEE: "/trainee",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login(loginEmail: string, loginPassword: string) {
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email: loginEmail, password: loginPassword, redirect: false });
    if (res?.error) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }
    const me = await fetch("/api/me").then((r) => r.json());
    router.push(roleRedirect[me?.roleType] ?? "/");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await login(email, password);
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-navy via-royal to-picton text-white">
        <Logo variant="onDark" />
        <div>
          <h1 className="text-4xl font-bold leading-tight">Learn. Grow. Get certified.</h1>
          <p className="mt-4 text-ice/80 max-w-md">
            A single platform for trainees, instructors, centres and administrators. Track progress,
            unlock learning, and award credentials — all in one place.
          </p>
          <div className="mt-10 flex gap-2">
            <span className="gt-badge bg-picton/30 text-white">Trainees</span>
            <span className="gt-badge bg-gold/30 text-white">Instructors</span>
            <span className="gt-badge bg-mint/30 text-white">Centres</span>
            <span className="gt-badge bg-magenta/30 text-white">Admins</span>
          </div>
        </div>
        <div className="text-xs text-ice/70">© {new Date().getFullYear()} GoTutors Academy</div>
      </div>

      <div className="flex flex-col p-6 lg:p-12">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>

        <div className="flex-1 grid place-items-center">
          <form onSubmit={onSubmit} className="gt-card w-full max-w-md p-8 shadow-xl">
            <h2 className="text-2xl font-bold">Welcome back</h2>
            <p className="text-sm text-[var(--muted)] mt-1">Single sign-in for all roles.</p>

            <div className="mt-6">
              <label className="gt-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="gt-input"
                placeholder="you@gotutors.example"
              />
            </div>
            <div className="mt-4">
              <label className="gt-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="gt-input"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="mt-3 text-sm text-orange">{error}</p>}

            <button disabled={loading} className="gt-btn-primary w-full mt-6">
              {loading ? "Signing in…" : "Sign in"}
            </button>

            <details className="mt-6 text-sm text-[var(--muted)]" open>
              <summary className="cursor-pointer">Demo accounts — one-click sign in</summary>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { label: "🔑 Super Admin", email: "super@gotutors.test" },
                  { label: "🏫 Centre Admin", email: "centre@gotutors.test" },
                  { label: "🧑‍🏫 Instructor", email: "instructor@gotutors.test" },
                  { label: "🧑‍🎓 Trainee", email: "trainee@gotutors.test" },
                ].map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    disabled={loading}
                    onClick={() => login(d.email, "Password1!")}
                    className="gt-btn-ghost justify-start text-sm"
                    title={`${d.email} / Password1!`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs">All use <code>Password1!</code> — hover a button to see its email.</p>
            </details>
          </form>
        </div>
      </div>
    </div>
  );
}
