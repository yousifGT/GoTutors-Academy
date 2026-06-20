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
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid request", details: result.error.flatten().fieldErrors },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: result.data };
}

/** Common reusable field schemas. */
export const zId = z.string().min(1).max(100);
export const zName = z.string().trim().min(1).max(200);
export const zEmail = z.string().trim().email().max(320);
export const zPassword = z.string().min(6).max(200);
