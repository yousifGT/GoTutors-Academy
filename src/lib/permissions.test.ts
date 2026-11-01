import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { userHasPermission, PERMISSIONS, ALL_PERMISSIONS, resolvePermissions } from "./permissions";

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

// The same resolution the pages use (getPermissions), so screens and API
// routes can never disagree about what someone may do.
describe("resolvePermissions", () => {
  it("takes the role's grants", () => {
    const p = resolvePermissions(
      [{ key: "course.create", allowed: true }, { key: "course.edit", allowed: false }],
      []
    );
    expect([...p]).toEqual(["course.create"]);
  });

  it("lets a personal override switch a permission off", () => {
    const p = resolvePermissions([{ key: "permissions.manage", allowed: true }], [{ key: "permissions.manage", allowed: false }]);
    expect(p.has("permissions.manage")).toBe(false);
  });

  it("lets a personal override switch a permission on", () => {
    const p = resolvePermissions([], [{ key: "reports.centre", allowed: true }]);
    expect(p.has("reports.centre")).toBe(true);
  });

  // Retired toggles stay in the database; they must grant nothing.
  it("ignores permissions that no longer exist", () => {
    const p = resolvePermissions([{ key: "user.view_all", allowed: true }, { key: "course.view_all", allowed: true }], []);
    expect(p.size).toBe(0);
  });

  it("no longer lists the three view permissions that nothing enforced", () => {
    const keys = ALL_PERMISSIONS.map((p) => p.key as string);
    expect(keys).not.toContain("course.view_all");
    expect(keys).not.toContain("user.view_all");
    expect(keys).not.toContain("user.view_centre");
  });
});
