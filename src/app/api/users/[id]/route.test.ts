import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (declared before importing the route under test) ---
const db = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  subPosition: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({
  PERMISSIONS: { USER_EDIT: "user.edit", USER_DELETE: "user.delete" },
  userHasPermission: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { getServerSession } from "next-auth";
import { userHasPermission } from "@/lib/permissions";
import { DELETE } from "./route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const hasPerm = userHasPermission as unknown as ReturnType<typeof vi.fn>;

function delReq() {
  return new Request("https://app.test/api/users/u1", { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPerm.mockResolvedValue(true);
  // Default: run the transaction callback against the same mocked client.
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
});

describe("DELETE /api/users/[id]", () => {
  it("blocks self-delete with 400", async () => {
    session.mockResolvedValue({ user: { id: "u1", roleType: "SUPER_ADMIN", centreId: null } });
    const res = await DELETE(delReq(), { params: { id: "u1" } });
    expect(res.status).toBe(400);
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it("blocks deleting the last super admin with 409", async () => {
    session.mockResolvedValue({ user: { id: "me", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue({ id: "u1", centreId: null, role: { type: "SUPER_ADMIN" } });
    db.user.count.mockResolvedValue(0); // no other super admins remain
    const res = await DELETE(delReq(), { params: { id: "u1" } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/last super admin/i);
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it("deletes a super admin when others remain", async () => {
    session.mockResolvedValue({ user: { id: "me", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue({ id: "u1", centreId: null, role: { type: "SUPER_ADMIN" } });
    db.user.count.mockResolvedValue(2);
    db.user.delete.mockResolvedValue({ id: "u1" });
    const res = await DELETE(delReq(), { params: { id: "u1" } });
    expect(res.status).toBe(200);
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  it("deletes a non-admin without the admin-count check", async () => {
    session.mockResolvedValue({ user: { id: "me", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue({ id: "u1", centreId: null, role: { type: "TRAINEE" } });
    db.user.delete.mockResolvedValue({ id: "u1" });
    const res = await DELETE(delReq(), { params: { id: "u1" } });
    expect(res.status).toBe(200);
    expect(db.user.count).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
