"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon?: string; badge?: number };

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
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card)]">
        <div className="p-5"><Logo /></div>
        <nav className="px-3 py-2 space-y-1">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-navy text-white"
                    : "text-[var(--fg)] hover:bg-[var(--soft)]"
                )}
              >
                <span>{item.label}</span>
                {item.badge && item.badge > 0 ? (
                  <span className={cn("ml-2 rounded-full px-2 py-0.5 text-xs font-bold", active ? "bg-white text-navy" : "bg-orange text-white")}>
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto p-4 border-t border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-picton text-navy grid place-items-center font-bold">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{user.name}</div>
              <div className="truncate text-xs text-[var(--muted)]">{user.roleType.replace("_", " ")}</div>
            </div>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="gt-btn-ghost w-full mt-3 text-sm">
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur px-6 py-3">
          <h1 className="font-bold text-lg">{title}</h1>
          <ThemeToggle />
        </header>
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
