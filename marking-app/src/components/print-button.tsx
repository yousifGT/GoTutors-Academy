"use client";

/** Hand the report to a parent. The print stylesheet drops the app chrome. */
export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn-ghost text-sm">
      Print
    </button>
  );
}
