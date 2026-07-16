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
  subPosition: { findFirst: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({
  PERMISSIONS: { USER_EDIT: "user.edit", USER_DELETE: "user.delete" },
  userHasPermission: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/training", () => ({ recomputeIsTrained: vi.fn() }));
vi.mock("@/lib/auto-enrol", () => ({ syncUserEnrollments: vi.fn() }));

import { getServerSession } from "next-auth";
import { userHasPermission } from "@/lib/permissions";
import { recomputeIsTrained } from "@/lib/training";
import { syncUserEnrollments } from "@/lib/auto-enrol";
import { Prisma } from "@prisma/client";
import { DELETE, PATCH } from "./route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const hasPerm = userHasPermission as unknown as ReturnType<typeof vi.fn>;
const recompute = recomputeIsTrained as unknown as ReturnType<typeof vi.fn>;
const syncEnrol = syncUserEnrollments as unknown as ReturnType<typeof vi.fn>;

function delReq() {
  return new Request("https://app.test/api/users/u1", { method: "DELETE" });
}
function patchReq(body: unknown) {
  return new Request("https://app.test/api/users/u1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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

describe("PATCH /api/users/[id]", () => {
  const target = { id: "u1", email: "old@x.com", roleId: "r1", isTrained: false, centreId: null, role: { type: "TRAINEE" } };

  it("returns 409 with a field error when changing email to one in use", async () => {
    session.mockResolvedValue({ user: { id: "admin", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue(target);
    db.user.findFirst.mockResolvedValue({ id: "other" }); // email already taken
    const res = await PATCH(patchReq({ email: "taken@x.com" }), { params: { id: "u1" } });
    expect(res.status).toBe(409);
    expect((await res.json()).details.email).toBeDefined();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("allows changing email to a free address", async () => {
    session.mockResolvedValue({ user: { id: "admin", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue(target);
    db.user.findFirst.mockResolvedValue(null); // free
    db.user.update.mockResolvedValue({ id: "u1" });
    const res = await PATCH(patchReq({ email: "fresh@x.com" }), { params: { id: "u1" } });
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalled();
  });

  it("maps a P2002 race on update to 409", async () => {
    session.mockResolvedValue({ user: { id: "admin", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue(target);
    db.user.findFirst.mockResolvedValue(null);
    db.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" })
    );
    const res = await PATCH(patchReq({ email: "fresh@x.com" }), { params: { id: "u1" } });
    expect(res.status).toBe(409);
  });
});

describe("PATCH /api/users/[id] centre-admin scoping", () => {
  const londonAdmin = { user: { id: "ca", roleType: "CENTRE_ADMIN", centreId: "london" } };

  it("403s a centre admin editing a trainee in another centre", async () => {
    session.mockResolvedValue(londonAdmin);
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "t@x.com", roleId: "r1", isTrained: false, centreId: "manchester", role: { type: "TRAINEE" } });
    const res = await PATCH(patchReq({ name: "New" }), { params: { id: "u1" } });
    expect(res.status).toBe(403);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("403s a centre admin editing a non-trainee in their own centre", async () => {
    session.mockResolvedValue(londonAdmin);
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "i@x.com", roleId: "r1", isTrained: false, centreId: "london", role: { type: "INSTRUCTOR" } });
    const res = await PATCH(patchReq({ name: "New" }), { params: { id: "u1" } });
    expect(res.status).toBe(403);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("lets a centre admin edit a trainee in their own centre", async () => {
    session.mockResolvedValue(londonAdmin);
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "t@x.com", roleId: "r1", isTrained: false, centreId: "london", role: { type: "TRAINEE" } });
    db.user.update.mockResolvedValue({ id: "u1" });
    const res = await PATCH(patchReq({ name: "New name" }), { params: { id: "u1" } });
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalled();
  });
});

describe("PATCH /api/users/[id] recomputes training status", () => {
  it("recomputes isTrained and syncs enrolments when the sub-positions change", async () => {
    session.mockResolvedValue({ user: { id: "admin", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "t@x.com", roleId: "r1", isTrained: false, centreId: null, subPosition: "Maths Tutor", role: { type: "TRAINEE" } });
    db.subPosition.count.mockResolvedValue(1);
    db.user.update.mockResolvedValue({ id: "u1" });
    const res = await PATCH(patchReq({ subPositions: ["Science Tutor"] }), { params: { id: "u1" } });
    expect(res.status).toBe(200);
    expect(recompute).toHaveBeenCalledWith("u1");
    expect(syncEnrol).toHaveBeenCalledWith("u1");
  });

  it("accepts the legacy single subPosition field and mirrors it into the array", async () => {
    session.mockResolvedValue({ user: { id: "admin", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "t@x.com", roleId: "r1", isTrained: false, centreId: null, subPosition: "Maths Tutor", role: { type: "TRAINEE" } });
    db.subPosition.count.mockResolvedValue(1);
    db.user.update.mockResolvedValue({ id: "u1" });
    const res = await PATCH(patchReq({ subPosition: "Science Tutor" }), { params: { id: "u1" } });
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { subPositions: ["Science Tutor"], subPosition: "Science Tutor" },
    });
  });

  it("400s when a sub-position does not exist for the role", async () => {
    session.mockResolvedValue({ user: { id: "admin", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "t@x.com", roleId: "r1", isTrained: false, centreId: null, role: { type: "TRAINEE" } });
    db.subPosition.count.mockResolvedValue(1); // only 1 of the 2 names exists
    const res = await PATCH(patchReq({ subPositions: ["Science Tutor", "Nope"] }), { params: { id: "u1" } });
    expect(res.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("does not recompute or sync for an unrelated field change", async () => {
    session.mockResolvedValue({ user: { id: "admin", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "t@x.com", roleId: "r1", isTrained: false, centreId: null, role: { type: "TRAINEE" } });
    db.user.findFirst.mockResolvedValue(null);
    db.user.update.mockResolvedValue({ id: "u1" });
    const res = await PATCH(patchReq({ name: "New" }), { params: { id: "u1" } });
    expect(res.status).toBe(200);
    expect(recompute).not.toHaveBeenCalled();
    expect(syncEnrol).not.toHaveBeenCalled();
  });
});
