/**
 * Runs once when the server starts, before it accepts a request.
 *
 * Configuration is checked here rather than lazily inside the code that reads
 * it, so a container with a missing variable dies on startup — where a
 * deployment notices and rolls back — instead of starting, going healthy, and
 * failing one user at a time.
 */
import { describe, fatals, isDeployed, problems } from "@/lib/config";

export async function register() {
  // Everything below is inside this check rather than behind an early return,
  // and that is load-bearing rather than a style choice: Next compiles this file
  // for the Edge runtime as well as Node, and replaces NEXT_RUNTIME with a
  // literal at build time. Written this way the whole block is dead code in the
  // Edge bundle and is dropped. Written as `if (... !== "nodejs") return;` it is
  // not, webpack follows the import anyway, and the build fails trying to
  // resolve `node:crypto` for a runtime that has no such thing.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const found = problems();
    if (found.length) console[fatals().length ? "error" : "warn"](describe(found));

    if (fatals().length && isDeployed()) {
      console.error("Refusing to start with a fatal configuration problem.");
      process.exit(1);
    }

    // Retries for report emails that a submit did not manage to send.
    const { startReportEmailSweep } = await import("@/lib/send-report");
    startReportEmailSweep();
  }
}
