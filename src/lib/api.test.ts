import { describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withRoute } from "./api";

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "5" });
}

const req = () => new Request("https://app.test/api/x", { method: "POST" });

describe("withRoute", () => {
  it("passes a successful response through", async () => {
    const h = withRoute(async () => NextResponse.json({ ok: true }));
    const res = await h(req(), {} as never);
    expect(res.status).toBe(200);
  });

  it("maps Prisma P2025 (not found) to 404", async () => {
    const h = withRoute(async () => {
      throw knownError("P2025");
    });
    expect((await h(req(), {} as never)).status).toBe(404);
  });

  it("maps Prisma P2002 (unique) to 409", async () => {
    const h = withRoute(async () => {
      throw knownError("P2002");
    });
    expect((await h(req(), {} as never)).status).toBe(409);
  });

  it("maps Prisma P2003 (FK) to 400", async () => {
    const h = withRoute(async () => {
      throw knownError("P2003");
    });
    expect((await h(req(), {} as never)).status).toBe(400);
  });

  it("returns a generic 500 for an unexpected error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const h = withRoute(async () => {
      throw new Error("boom");
    });
    const res = await h(req(), {} as never);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Internal server error");
    spy.mockRestore();
  });
});
