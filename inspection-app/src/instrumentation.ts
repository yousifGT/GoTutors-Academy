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
  // The Edge runtime has no process to exit and does not run this check.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const found = problems();
  if (found.length) console[fatals().length ? "error" : "warn"](describe(found));

  if (fatals().length && isDeployed()) {
    console.error("Refusing to start with a fatal configuration problem.");
    process.exit(1);
  }
}
