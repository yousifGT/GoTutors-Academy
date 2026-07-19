"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon?: string; badge?: number };

const profileBase: Record<string, string> = {
  SUPER_ADMIN: "/admin",
  CENTRE_ADMIN: "/centre",
  INSTRUCTOR: "/instructor",
  TRAINEE: "/trainee",
};

export function DashboardShell({
  user,
  nav,
  title,
  children,
}: {
  user: { name: string; email: string; roleType: string };
  nav: NavItem[];
  title?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen flex bg-[var(--bg)]">
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-gradient-to-b from-navy via-[#1a1750] to-[#110f33] text-white">
        <div className="p-5">
          <Logo variant="onDark" />
        </div>
        <nav className="px-3 py-2 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/15 text-white"
                    : "text-white/65 hover:bg-white/10 hover:text-white"
                )}
              >
                {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-picton" />}
                {item.icon && <span className="text-base leading-none">{item.icon}</span>}
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && item.badge > 0 ? (
                  <span className="ml-2 rounded-full bg-orange px-2 py-0.5 text-xs font-bold text-white">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto p-4 border-t border-white/10">
          <Link
            href={`${profileBase[user.roleType] ?? "/trainee"}/profile`}
            title="My profile"
            className="flex items-center gap-3 rounded-xl -m-1 p-1 transition-colors hover:bg-white/10"
          >
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-picton to-cyan font-bold text-navy">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{user.name}</div>
              <div className="truncate text-xs text-white/60">{user.roleType.replace("_", " ")}</div>
            </div>
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="mt-3 w-full rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/80 px-6 py-3.5 backdrop-blur-md">
          <h1 className="text-lg font-bold tracking-tight">{title}</h1>
          <ThemeToggle />
        </header>
        <div className="mx-auto max-w-7xl p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
