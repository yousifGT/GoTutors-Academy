"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function ListSearch({ placeholder = "Search…" }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => {
    const handle = setTimeout(() => {
      const sp = new URLSearchParams(Array.from(params.entries()));
      if (q) sp.set("q", q); else sp.delete("q");
      router.replace(`${pathname}?${sp.toString()}`);
    }, 250);
    return () => clearTimeout(handle);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      type="search"
      placeholder={placeholder}
      value={q}
      onChange={(e) => setQ(e.target.value)}
      className="gt-input max-w-sm"
    />
  );
}
