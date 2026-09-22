import { z } from "zod";
import { NextResponse } from "next/server";

/**
 * Validate a JSON request body against a zod schema.
 *
 *   const parsed = await parseJson(req, Schema);
 *   if (!parsed.ok) return parsed.response;
 *   const { ... } = parsed.data;   // fully typed
 */
export type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export async function parseJson<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<ParseResult<z.infer<T>>> {
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
      response: NextResponse.json({ error: describeFieldErrors(fieldErrors), details: fieldErrors }, { status: 400 }),
    };
  }
  return { ok: true, data: result.data };
}

/** A message that says which field is wrong and why — forms show this verbatim. */
function describeFieldErrors(fieldErrors: Record<string, string[] | undefined>): string {
  const parts = Object.entries(fieldErrors)
    .map(([field, messages]) => (messages?.length ? `${field}: ${messages[0]}` : null))
    .filter((part): part is string => part !== null);
  return parts.length ? parts.join("; ") : "Invalid request";
}

export const zId = z.string().min(1).max(100);
export const zName = z.string().trim().min(1, "A name is required").max(200, "Name is too long (max 200 characters)");

/**
 * Sign-in lowercases the address and looks it up against a case-sensitive
 * unique column, so every write path has to fold the case too — otherwise
 * saving "Name@Example.com" locks that person out of their own account.
 */
export const zEmail = z.string().trim().toLowerCase().email("That doesn't look like a valid email address").max(320);

export const zPassword = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "Password is too long (max 200 characters)");
