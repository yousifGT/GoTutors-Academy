import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  inspection: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  inspectionQuestion: { findMany: vi.fn() },
  inspectionAnswer: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/inspection/access", async (orig) => ({
  ...(await orig<typeof import("@/lib/inspection/access")>()),
  inspectionAccess: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { inspectionAccess } from "@/lib/inspection/access";
import { PATCH, DELETE } from "./route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const access = inspectionAccess as unknown as ReturnType<typeof vi.fn>;
const ctx = { params: { id: "i1" } };

const patch = (body: unknown) =>
  new Request("https://app.test/api/inspections/i1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const draft = { id: "i1", inspectorId: "u1", centreId: "c1", status: "DRAFT", templateId: "t1" };

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "u1", centreId: "c1", roleType: "SUPER_ADMIN" } });
  access.mockResolvedValue({ viewAll: true, viewCentre: true, conduct: true, manageTemplate: true });
  db.inspection.findUnique.mockResolvedValue(draft);
  db.$transaction.mockResolvedValue([]);
});

describe("PATCH /api/inspections/[id]", () => {
  it("401s without a session", async () => {
    session.mockResolvedValue(null);
    expect((await PATCH(patch({ activeMs: 1000 }), ctx)).status).toBe(401);
  });

  it("refuses to edit a submitted inspection", async () => {
    db.inspection.findUnique.mockResolvedValue({ ...draft, status: "SUBMITTED" });
    const res = await PATCH(patch({ activeMs: 1000 }), ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("This inspection has been submitted");
  });

  it("refuses to edit someone else's draft", async () => {
    session.mockResolvedValue({ user: { id: "u2", centreId: "c1", roleType: "SUPER_ADMIN" } });
    expect((await PATCH(patch({ activeMs: 1000 }), ctx)).status).toBe(403);
  });

  it("checkpoints the active clock", async () => {
    const res = await PATCH(patch({ activeMs: 754_000 }), ctx);
    expect(res.status).toBe(200);
    expect(db.inspection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { activeMs: 754_000 } })
    );
  });

  it("rejects a nonsensical clock value", async () => {
    expect((await PATCH(patch({ activeMs: -5 }), ctx)).status).toBe(400);
    expect((await PATCH(patch({ activeMs: 999_999_999 }), ctx)).status).toBe(400);
  });

  it("rejects a question that belongs to another checklist", async () => {
    db.inspectionQuestion.findMany.mockResolvedValue([]); // none match this template
    const res = await PATCH(patch({ answers: [{ questionId: "q-other", answer: "yes" }] }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).details).toEqual(["q-other"]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("saves an answer with its notes and photos, snapshotting the question text", async () => {
    db.inspectionQuestion.findMany.mockResolvedValue([{ id: "q1", text: "Fire exits clear" }]);
    const res = await PATCH(
      patch({
        answers: [
          {
            questionId: "q1",
            answer: "no",
            entries: [{ note: "Boxes across the rear exit", who: "Sara", photos: ["https://s3.test/x.jpg"] }],
          },
        ],
      }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, saved: 1 });
    expect(db.inspectionAnswer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ questionText: "Fire exits clear", answer: "no" }),
      })
    );
  });

  it("replaces a question's entries wholesale, so a deleted note disappears", async () => {
    db.inspectionQuestion.findMany.mockResolvedValue([{ id: "q1", text: "Fire exits clear" }]);
    await PATCH(patch({ answers: [{ questionId: "q1", answer: "yes", entries: [] }] }), ctx);
    const call = db.inspectionAnswer.upsert.mock.calls[0][0];
    expect(call.update.entries.deleteMany).toEqual({});
    expect(call.update.entries.create).toEqual([]);
  });

  it("saves debrief fields", async () => {
    const res = await PATCH(patch({ debriefName: "A. Khan", debriefEmail: "a@example.com" }), ctx);
    expect(res.status).toBe(200);
    expect(db.inspection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { debriefName: "A. Khan", debriefEmail: "a@example.com" } })
    );
  });

  it("rejects a malformed debrief email", async () => {
    expect((await PATCH(patch({ debriefEmail: "not-an-email" }), ctx)).status).toBe(400);
  });
});

describe("DELETE /api/inspections/[id]", () => {
  it("discards a draft", async () => {
    const res = await DELETE(new Request("https://app.test/api/inspections/i1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    expect(db.inspection.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
  });

  it("will not delete a submitted inspection", async () => {
    db.inspection.findUnique.mockResolvedValue({ ...draft, status: "SUBMITTED" });
    const res = await DELETE(new Request("https://app.test/api/inspections/i1", { method: "DELETE" }), ctx);
    expect(res.status).toBe(403);
    expect(db.inspection.delete).not.toHaveBeenCalled();
  });
});
