import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

type RouteHandler<C> = (req: Request, ctx: C) => Promise<Response> | Response;

/**
 * Next tags its bail-out errors with a `digest` rather than exporting a public
 * class, so match on that instead of reaching into an internal module path.
 */
function isDynamicServerError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("DYNAMIC_SERVER_USAGE")
  );
}

/**
 * Wrap a route handler so an unexpected throw becomes a clean JSON response
 * instead of leaking a stack trace as a raw 500. Prisma's common known errors
 * map to the right status:
 *   P2025 (record not found) -> 404
 *   P2002 (unique violation) -> 409
 *   P2003 (FK violation)     -> 400
 * Everything else is logged server-side and returned as a generic 500.
 *
 * Usage:  export const POST = withRoute(async (req, { params }) => { ... })
 */
export function withRoute<C>(handler: RouteHandler<C>): RouteHandler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      // Next signals "this route can't be prerendered" by throwing from inside
      // headers()/cookies() during the build's static analysis. That is control
      // flow, not a failure: swallowing it makes the build log a phantom error
      // and can bake a static 500 into a route that should be dynamic. Rethrow
      // so Next sees it and marks the route dynamic.
      if (isDynamicServerError(e)) throw e;

      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") return NextResponse.json({ error: "not found" }, { status: 404 });
        if (e.code === "P2002") return NextResponse.json({ error: "Already exists" }, { status: 409 });
        if (e.code === "P2003") return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
      }
      let url = "";
      try {
        url = new URL(req.url).pathname;
      } catch {
        /* ignore */
      }
      console.error("unhandled route error", { url, err: e });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
