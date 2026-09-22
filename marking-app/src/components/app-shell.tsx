"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

export function AppShell({
  user,
  nav,
  children,
}: {
  user: { name: string; email: string; role: string; organisation: string };
  nav: NavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer on navigation, or it stays over the page you just
  // asked for.
  useEffect(() => setOpen(false), [pathname]);

  const sidebar = (
    <>
      <div className="p-5">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/15">🖊️</span>
          Marker
        </Link>
        <div className="mt-1 truncate text-xs text-white/50">{user.organisation}</div>
      </div>
      <nav className="space-y-1 overflow-y-auto px-3 py-2">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-white/15 text-white" : "text-white/65 hover:bg-white/10 hover:text-white"
              )}
            >
              {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-sky" />}
              <span className="text-base leading-none">{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="ml-2 rounded-full bg-coral px-2 py-0.5 text-xs font-bold text-white">{item.badge}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-white/10 p-4">
        <Link href="/account" className="flex items-center gap-3 rounded-xl p-1 transition-colors hover:bg-white/10">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-sky to-teal font-bold text-white">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{user.name}</div>
            <div className="truncate text-xs text-white/60">{user.role === "ADMIN" ? "Admin" : "Marker"}</div>
          </div>
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-3 w-full rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <aside className="no-print hidden w-64 shrink-0 flex-col bg-gradient-to-b from-ink via-[#1b1b40] to-[#121230] text-white md:flex">
        {sidebar}
      </aside>

      {open && (
        <div className="no-print fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-gradient-to-b from-ink via-[#1b1b40] to-[#121230] text-white">
            {sidebar}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/85 px-4 py-3 backdrop-blur-md sm:px-6">
          <button className="btn-ghost md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <div className="hidden text-sm text-[var(--muted)] md:block">{user.organisation}</div>
          <ThemeToggle />
        </header>
        <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // The server has no idea what the browser's theme is, so render nothing until
  // the client knows — otherwise the first paint shows the wrong icon.
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="h-9 w-9" />;

  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border)] transition hover:bg-[var(--soft)]"
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
