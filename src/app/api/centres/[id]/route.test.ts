import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { count: vi.fn() },
  centre: { delete: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/permissions", () => ({
  PERMISSIONS: { CENTRE_MANAGE: "centre.manage" },
  userHasPermission: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { getServerSession } from "next-auth";
import { userHasPermission } from "@/lib/permissions";
import { PATCH, DELETE } from "./route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const hasPerm = userHasPermission as unknown as ReturnType<typeof vi.fn>;

function delReq() {
  return new Request("https://app.test/api/centres/c1", { method: "DELETE" });
}
function patchReq(body: unknown) {
  return new Request("https://app.test/api/centres/c1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPerm.mockResolvedValue(true);
  session.mockResolvedValue({ user: { id: "admin", roleType: "SUPER_ADMIN" } });
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
});

describe("DELETE /api/centres/[id]", () => {
  it("blocks deletion with 409 when users are attached", async () => {
    db.user.count.mockResolvedValue(3);
    const res = await DELETE(delReq(), { params: { id: "c1" } });
    expect(res.status).toBe(409);
    expect(db.centre.delete).not.toHaveBeenCalled();
  });

  it("deletes an empty centre", async () => {
    db.user.count.mockResolvedValue(0);
    db.centre.delete.mockResolvedValue({ id: "c1" });
    const res = await DELETE(delReq(), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    expect(db.centre.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("403s a user without CENTRE_MANAGE", async () => {
    hasPerm.mockResolvedValue(false);
    const res = await DELETE(delReq(), { params: { id: "c1" } });
    expect(res.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/centres/[id]", () => {
  it("edits the centre name", async () => {
    db.centre.update.mockResolvedValue({ id: "c1", name: "Renamed" });
    const res = await PATCH(patchReq({ name: "Renamed" }), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    expect(db.centre.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { name: "Renamed" } });
  });

  it("rejects an empty name", async () => {
    const res = await PATCH(patchReq({ name: "" }), { params: { id: "c1" } });
    expect(res.status).toBe(400);
    expect(db.centre.update).not.toHaveBeenCalled();
  });
});
