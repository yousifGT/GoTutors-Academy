import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { userHasPermission, PERMISSIONS } from "./permissions";

type Perm = { allowed: boolean; permission: { key: string } };
function userWith(opts: { rolePerms?: Perm[]; overrides?: Perm[] }) {
  return {
    role: { permissions: opts.rolePerms ?? [] },
    permissionOverrides: opts.overrides ?? [],
  };
}

beforeEach(() => vi.clearAllMocks());

describe("userHasPermission", () => {
  it("returns false when the user doesn't exist", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await userHasPermission("u1", PERMISSIONS.USER_EDIT)).toBe(false);
  });

  it("grants when the role allows and there is no override", async () => {
    db.user.findUnique.mockResolvedValue(
      userWith({ rolePerms: [{ allowed: true, permission: { key: PERMISSIONS.USER_EDIT } }] })
    );
    expect(await userHasPermission("u1", PERMISSIONS.USER_EDIT)).toBe(true);
  });

  it("denies when neither the role nor an override grants it", async () => {
    db.user.findUnique.mockResolvedValue(userWith({}));
    expect(await userHasPermission("u1", PERMISSIONS.USER_EDIT)).toBe(false);
  });

  it("an allow override beats a role that lacks the permission", async () => {
    db.user.findUnique.mockResolvedValue(
      userWith({ overrides: [{ allowed: true, permission: { key: PERMISSIONS.USER_EDIT } }] })
    );
    expect(await userHasPermission("u1", PERMISSIONS.USER_EDIT)).toBe(true);
  });

  it("a deny override beats a role that grants the permission", async () => {
    db.user.findUnique.mockResolvedValue(
      userWith({
        rolePerms: [{ allowed: true, permission: { key: PERMISSIONS.USER_EDIT } }],
        overrides: [{ allowed: false, permission: { key: PERMISSIONS.USER_EDIT } }],
      })
    );
    expect(await userHasPermission("u1", PERMISSIONS.USER_EDIT)).toBe(false);
  });
});
