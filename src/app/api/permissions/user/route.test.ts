import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  userPermissionOverride: { upsert: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn() },
  permission: { findUnique: vi.fn() },
}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({
  PERMISSIONS: { PERMISSIONS_MANAGE: "permissions.manage" },
  userHasPermission: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { getServerSession } from "next-auth";
import { userHasPermission } from "@/lib/permissions";
import { POST } from "./route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const hasPerm = userHasPermission as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("https://app.test/api/permissions/user", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPerm.mockResolvedValue(true);
  db.user.findUnique.mockResolvedValue({ email: "t@x.com" });
  db.permission.findUnique.mockResolvedValue({ key: "user.edit" });
});

describe("POST /api/permissions/user", () => {
  it("403s a non-super-admin even with the permission flag", async () => {
    session.mockResolvedValue({ user: { id: "ca", roleType: "CENTRE_ADMIN" } });
    const res = await POST(req({ userId: "u2", permissionId: "p1", value: "allow" }), );
    expect(res.status).toBe(403);
    expect(db.userPermissionOverride.upsert).not.toHaveBeenCalled();
  });

  it("403s an admin editing their own permissions", async () => {
    session.mockResolvedValue({ user: { id: "sa", roleType: "SUPER_ADMIN" } });
    const res = await POST(req({ userId: "sa", permissionId: "p1", value: "allow" }));
    expect(res.status).toBe(403);
    expect(db.userPermissionOverride.upsert).not.toHaveBeenCalled();
  });

  it("lets a super admin set another user's override", async () => {
    session.mockResolvedValue({ user: { id: "sa", roleType: "SUPER_ADMIN" } });
    db.userPermissionOverride.upsert.mockResolvedValue({});
    const res = await POST(req({ userId: "u2", permissionId: "p1", value: "allow" }));
    expect(res.status).toBe(200);
    expect(db.userPermissionOverride.upsert).toHaveBeenCalled();
  });
});
