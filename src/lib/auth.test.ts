import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { authOptions } from "./auth";

const jwt = authOptions.callbacks!.jwt!;
const sessionCb = authOptions.callbacks!.session!;

beforeEach(() => vi.clearAllMocks());

describe("jwt callback — session freshness", () => {
  it("seeds the token on initial sign-in", async () => {
    const user = { id: "u1", roleType: "TRAINEE", roleId: "r1", centreId: null, position: null };
    const token: any = await jwt({ token: {}, user } as any);
    expect(token.uid).toBe("u1");
    expect(token.invalid).toBe(false);
    expect(typeof token.checkedAt).toBe("number");
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("does not hit the DB within the staleness window", async () => {
    const token: any = { uid: "u1", roleType: "TRAINEE", checkedAt: Date.now() };
    await jwt({ token } as any);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("marks the token invalid when the user is deactivated", async () => {
    db.user.findUnique.mockResolvedValue({ active: false, roleId: "r1", centreId: null, position: null, role: { type: "TRAINEE" } });
    const token: any = { uid: "u1", roleType: "TRAINEE", checkedAt: Date.now() - 70_000 };
    const out: any = await jwt({ token } as any);
    expect(out.invalid).toBe(true);
  });

  it("marks the token invalid when the user no longer exists", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const token: any = { uid: "u1", roleType: "TRAINEE", checkedAt: Date.now() - 70_000 };
    const out: any = await jwt({ token } as any);
    expect(out.invalid).toBe(true);
  });

  it("refreshes role/centre for an active user past the window", async () => {
    db.user.findUnique.mockResolvedValue({ active: true, roleId: "r2", centreId: "ce2", position: null, role: { type: "CENTRE_ADMIN" } });
    const token: any = { uid: "u1", roleType: "TRAINEE", checkedAt: Date.now() - 70_000 };
    const out: any = await jwt({ token } as any);
    expect(out.invalid).toBe(false);
    expect(out.roleType).toBe("CENTRE_ADMIN");
    expect(out.centreId).toBe("ce2");
  });
});

describe("session callback", () => {
  it("drops the user when the token is invalid", async () => {
    const out: any = await sessionCb({
      session: { user: { id: "u1" }, expires: "x" },
      token: { invalid: true },
    } as any);
    expect(out.user).toBeUndefined();
  });

  it("populates the user from a valid token", async () => {
    const out: any = await sessionCb({
      session: { user: { email: "a@b.c" }, expires: "x" },
      token: { uid: "u1", roleType: "TRAINEE", roleId: "r1", centreId: null, position: null, invalid: false },
    } as any);
    expect(out.user.id).toBe("u1");
    expect(out.user.roleType).toBe("TRAINEE");
  });
});
