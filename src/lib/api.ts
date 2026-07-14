import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

type RouteHandler<C> = (req: Request, ctx: C) => Promise<Response> | Response;

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
