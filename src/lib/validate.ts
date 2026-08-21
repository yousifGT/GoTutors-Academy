import { z } from "zod";
import { NextResponse } from "next/server";

/**
 * Validate a JSON request body against a zod schema.
 *
 * Returns a discriminated union so callers stay type-safe:
 *
 *   const parsed = await parseJson(req, Schema);
 *   if (!parsed.ok) return parsed.response;
 *   const { ... } = parsed.data;   // fully typed
 *
 * On malformed JSON or a schema mismatch it returns a 400 response with the
 * field errors, so routes no longer hand untyped bodies straight to Prisma.
 */
export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function parseJson<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<ParseResult<z.infer<T>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    return {
      ok: false,
      response: NextResponse.json(
        { error: describeFieldErrors(fieldErrors), details: fieldErrors },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: result.data };
}

/**
 * A message that says which field is wrong and why.
 *
 * The per-field details were already computed and returned, but the `error`
 * string — the only part the forms display — was the fixed text "Invalid
 * request". Typing a four-character password was rejected with no hint that a
 * minimum length even existed. Naming the field and the reason costs nothing and
 * fixes every form at once.
 */
function describeFieldErrors(fieldErrors: Record<string, string[] | undefined>): string {
  const parts = Object.entries(fieldErrors)
    .map(([field, messages]) => (messages?.length ? `${field}: ${messages[0]}` : null))
    .filter((part): part is string => part !== null);
  return parts.length ? parts.join("; ") : "Invalid request";
}

/**
 * Common reusable field schemas. Messages are spelled out rather than left to
 * Zod's defaults, because these reach end users verbatim.
 */
export const zId = z.string().min(1).max(100);
export const zName = z.string().trim().min(1, "A name is required").max(200, "Name is too long (max 200 characters)");
export const zEmail = z.string().trim().email("That doesn't look like a valid email address").max(320);
export const zPassword = z
  .string()
  .min(6, "Password must be at least 6 characters")
  .max(200, "Password is too long (max 200 characters)");

/**
 * A name for something people pick from a list — a role, a sub-position.
 *
 * `min(1)` accepted a single comma, and one got created. It cascades into
 * `subPositions` arrays, course assignments and audit targets, where it reads as
 * corruption rather than as a name. Requiring one letter or digit costs nothing
 * and keeps punctuation-only names out.
 */
export const zPositionName = zName.refine((v) => /[\p{L}\p{N}]/u.test(v), {
  message: "Name must contain at least one letter or number",
});
