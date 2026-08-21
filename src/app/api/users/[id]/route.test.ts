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
  subPosition: { findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  role: { findUnique: vi.fn() },
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
    db.subPosition.findMany.mockResolvedValue([{ name: "Science Tutor" }]);
    db.user.update.mockResolvedValue({ id: "u1" });
    const res = await PATCH(patchReq({ subPositions: ["Science Tutor"] }), { params: { id: "u1" } });
    expect(res.status).toBe(200);
    expect(recompute).toHaveBeenCalledWith("u1");
    expect(syncEnrol).toHaveBeenCalledWith("u1");
  });

  it("accepts the legacy single subPosition field and mirrors it into the array", async () => {
    session.mockResolvedValue({ user: { id: "admin", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "t@x.com", roleId: "r1", isTrained: false, centreId: null, subPosition: "Maths Tutor", role: { type: "TRAINEE" } });
    db.subPosition.findMany.mockResolvedValue([{ name: "Science Tutor" }]);
    db.user.update.mockResolvedValue({ id: "u1" });
    const res = await PATCH(patchReq({ subPosition: "Science Tutor" }), { params: { id: "u1" } });
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { subPositions: ["Science Tutor"], subPosition: "Science Tutor" },
    });
  });

  it("400s and names the field that does not exist", async () => {
    session.mockResolvedValue({ user: { id: "admin", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "t@x.com", roleId: "r1", isTrained: false, centreId: null, role: { type: "TRAINEE" } });
    db.subPosition.findMany.mockResolvedValue([{ name: "Science Tutor" }]); // "Nope" is absent
    const res = await PATCH(patchReq({ subPositions: ["Science Tutor", "Nope"] }), { params: { id: "u1" } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Nope");
    expect(db.user.update).not.toHaveBeenCalled();
  });

  // The bug that made every promoted tutor uneditable: fields live on the
  // Trainee role, but a promoted person sits on the bare Tutor role, so a
  // lookup scoped to their own role always came back empty.
  it("saves a promoted tutor whose remaining field belongs to another trainee-type role", async () => {
    session.mockResolvedValue({ user: { id: "admin", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue({
      id: "u1", email: "t@x.com", roleId: "tutorRole", isTrained: false, centreId: null,
      subPositions: ["Science Trainee"], role: { type: "TRAINEE" },
    });
    db.subPosition.findMany.mockResolvedValue([{ name: "Science Trainee" }]);
    db.user.update.mockResolvedValue({ id: "u1" });
    const res = await PATCH(
      patchReq({ phone: "07000 000000", roleId: "tutorRole", subPositions: ["Science Trainee"] }),
      { params: { id: "u1" } }
    );
    expect(res.status).toBe(200);
    // The query must not be scoped by roleId — that scoping was the defect.
    const where = db.subPosition.findMany.mock.calls[0][0].where;
    expect(where.roleId).toBeUndefined();
    expect(where.role).toEqual({ type: "TRAINEE" });
  });

  it("refuses training fields on a non-trainee role", async () => {
    session.mockResolvedValue({ user: { id: "admin", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "i@x.com", roleId: "r1", isTrained: false, centreId: null, role: { type: "INSTRUCTOR" } });
    const res = await PATCH(patchReq({ subPositions: ["Science Trainee"] }), { params: { id: "u1" } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("trainee roles");
    expect(db.subPosition.findMany).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("checks the role being moved TO, not the one being left", async () => {
    session.mockResolvedValue({ user: { id: "admin", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "t@x.com", roleId: "traineeRole", isTrained: false, centreId: null, role: { type: "TRAINEE" } });
    db.role.findUnique.mockResolvedValue({ type: "INSTRUCTOR" });
    const res = await PATCH(patchReq({ roleId: "instructorRole", subPositions: ["Science Trainee"] }), { params: { id: "u1" } });
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

describe("PATCH /api/users/[id] protects the last super admin", () => {
  const superAdmin = { user: { id: "admin", roleType: "SUPER_ADMIN", centreId: null } };
  const superTarget = {
    id: "u1", email: "boss@x.com", roleId: "superRole", isTrained: false,
    centreId: null, active: true, role: { type: "SUPER_ADMIN" },
  };

  it("refuses to deactivate the last active super admin", async () => {
    session.mockResolvedValue(superAdmin);
    db.user.findUnique.mockResolvedValue(superTarget);
    db.user.count.mockResolvedValue(0); // no other ACTIVE super admin
    const res = await PATCH(patchReq({ active: false }), { params: { id: "u1" } });
    expect(res.status).toBe(409);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuses to demote the last active super admin", async () => {
    session.mockResolvedValue(superAdmin);
    db.user.findUnique.mockResolvedValue(superTarget);
    db.role.findUnique.mockResolvedValue({ type: "TRAINEE" });
    db.user.count.mockResolvedValue(0);
    const res = await PATCH(patchReq({ roleId: "traineeRole" }), { params: { id: "u1" } });
    expect(res.status).toBe(409);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("allows it when another active super admin remains", async () => {
    session.mockResolvedValue(superAdmin);
    db.user.findUnique.mockResolvedValue(superTarget);
    db.user.count.mockResolvedValue(1);
    db.user.update.mockResolvedValue({ id: "u1" });
    const res = await PATCH(patchReq({ active: false }), { params: { id: "u1" } });
    expect(res.status).toBe(200);
  });

  it("refuses self-deactivation outright", async () => {
    session.mockResolvedValue({ user: { id: "u1", roleType: "SUPER_ADMIN", centreId: null } });
    db.user.findUnique.mockResolvedValue({ ...superTarget, id: "u1" });
    const res = await PATCH(patchReq({ active: false }), { params: { id: "u1" } });
    expect(res.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("400s an unknown roleId instead of throwing on the write", async () => {
    session.mockResolvedValue(superAdmin);
    db.user.findUnique.mockResolvedValue({ id: "u1", email: "t@x.com", roleId: "r1", isTrained: false, centreId: null, active: true, role: { type: "TRAINEE" } });
    db.role.findUnique.mockResolvedValue(null);
    const res = await PATCH(patchReq({ roleId: "ghost" }), { params: { id: "u1" } });
    expect(res.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
