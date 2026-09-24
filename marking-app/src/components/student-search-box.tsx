"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * The search box on the students page.
 *
 * It drives a query parameter rather than filtering in the browser, so the
 * result of a search is a URL an admin can bookmark or send to a colleague —
 * and so a centre with two thousand children never ships two thousand rows to
 * the page to filter them client-side.
 */
export function StudentSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);

  useEffect(() => {
    // Debounced, so typing an admission number is one navigation, not eight.
    const timer = setTimeout(() => {
      if (value === initial) return;
      const query = value.trim();
      router.push(query ? `/students?q=${encodeURIComponent(query)}` : "/students");
    }, 250);
    return () => clearTimeout(timer);
  }, [value, initial, router]);

  return (
    <div className="card">
      <label className="block text-sm font-medium">
        Find a student
        <input
          className="input mt-1"
          placeholder="Admission number or name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
        />
      </label>
    </div>
  );
}
