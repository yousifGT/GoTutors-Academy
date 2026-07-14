import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  rolePermission: { upsert: vi.fn() },
  role: { findUnique: vi.fn() },
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
  return new Request("https://app.test/api/permissions/role", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPerm.mockResolvedValue(true);
  db.permission.findUnique.mockResolvedValue({ key: "user.edit" });
});

describe("POST /api/permissions/role", () => {
  it("403s a non-super-admin", async () => {
    session.mockResolvedValue({ user: { id: "ca", roleType: "CENTRE_ADMIN" } });
    const res = await POST(req({ roleId: "r1", permissionId: "p1", allowed: true }));
    expect(res.status).toBe(403);
    expect(db.rolePermission.upsert).not.toHaveBeenCalled();
  });

  it("403s attempts to weaken the SUPER_ADMIN role", async () => {
    session.mockResolvedValue({ user: { id: "sa", roleType: "SUPER_ADMIN" } });
    db.role.findUnique.mockResolvedValue({ name: "Super Admin", type: "SUPER_ADMIN" });
    const res = await POST(req({ roleId: "r-super", permissionId: "p1", allowed: false }));
    expect(res.status).toBe(403);
    expect(db.rolePermission.upsert).not.toHaveBeenCalled();
  });

  it("lets a super admin edit a non-super role", async () => {
    session.mockResolvedValue({ user: { id: "sa", roleType: "SUPER_ADMIN" } });
    db.role.findUnique.mockResolvedValue({ name: "Instructor", type: "INSTRUCTOR" });
    db.rolePermission.upsert.mockResolvedValue({});
    const res = await POST(req({ roleId: "r2", permissionId: "p1", allowed: true }));
    expect(res.status).toBe(200);
    expect(db.rolePermission.upsert).toHaveBeenCalled();
  });
});
