import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  inspection: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  question: { findMany: vi.fn() },
  answer: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/session", () => ({ viewerOr401: vi.fn() }));

import { viewerOr401 } from "@/lib/session";
import { PATCH, DELETE } from "./route";

const auth = viewerOr401 as unknown as ReturnType<typeof vi.fn>;
const asUser = (id: string, role = "INSPECTOR") => auth.mockResolvedValue({ viewer: { id, role } });
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
  asUser("u1");
  db.inspection.findUnique.mockResolvedValue(draft);
  db.$transaction.mockResolvedValue([]);
});

describe("PATCH /api/inspections/[id]", () => {
  it("401s without a session", async () => {
    auth.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "unauth" }), { status: 401 }),
    });
    expect((await PATCH(patch({ activeMs: 1000 }), ctx)).status).toBe(401);
  });

  it("refuses to edit a submitted inspection", async () => {
    db.inspection.findUnique.mockResolvedValue({ ...draft, status: "SUBMITTED" });
    const res = await PATCH(patch({ activeMs: 1000 }), ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("This inspection has been submitted");
  });

  it("refuses a role that cannot carry out inspections", async () => {
    asUser("u1", "READ_ONLY");
    expect((await PATCH(patch({ activeMs: 1000 }), ctx)).status).toBe(403);
  });

  it("refuses to edit someone else's draft", async () => {
    asUser("u2");
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
    db.question.findMany.mockResolvedValue([]); // none match this template
    const res = await PATCH(patch({ answers: [{ questionId: "q-other", answer: "yes" }] }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).details).toEqual(["q-other"]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("saves an answer with its notes and photos, snapshotting the question text", async () => {
    db.question.findMany.mockResolvedValue([{ id: "q1", text: "Fire exits clear" }]);
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
    expect(db.answer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ questionText: "Fire exits clear", answer: "no" }),
      })
    );
  });

  it("replaces a question's entries wholesale, so a deleted note disappears", async () => {
    db.question.findMany.mockResolvedValue([{ id: "q1", text: "Fire exits clear" }]);
    await PATCH(patch({ answers: [{ questionId: "q1", answer: "yes", entries: [] }] }), ctx);
    const call = db.answer.upsert.mock.calls[0][0];
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
