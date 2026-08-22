import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  inspection: { findUnique: vi.fn(), update: vi.fn() },
  inspectionAnswer: { update: vi.fn() },
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
import { audit } from "@/lib/audit";
import { inspectionAccess } from "@/lib/inspection/access";
import { POST } from "./route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const access = inspectionAccess as unknown as ReturnType<typeof vi.fn>;

const req = () => new Request("https://app.test/api/inspections/i1/submit", { method: "POST" });
const ctx = { params: { id: "i1" } };

const question = (over: Record<string, unknown>) => ({
  id: "q1",
  text: "Fire exits clear",
  type: "YESNO",
  order: 0,
  options: null,
  minVal: null,
  maxVal: null,
  unit: null,
  scored: false,
  requireNote: false,
  critical: false,
  photoExempt: false,
  allowNA: false,
  whoField: false,
  guide: null,
  dos: null,
  donts: null,
  sizeGuide: null,
  minBySize: null,
  tallyKey: null,
  ...over,
});

/** A one-question inspection, answered as given. */
function inspection(over: {
  status?: string;
  size?: string;
  questions?: ReturnType<typeof question>[];
  answers?: { questionId: string; answer: string | null; entries: { note: string | null; who: string | null; photos: { url: string }[] }[] }[];
}) {
  return {
    id: "i1",
    centreId: "c1",
    inspectorId: "u1",
    status: over.status ?? "DRAFT",
    size: over.size ?? "SMALL",
    template: { sections: [{ title: "S", order: 0, questions: over.questions ?? [question({})] }] },
    answers: over.answers ?? [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "u1", centreId: "c1", roleType: "SUPER_ADMIN" } });
  access.mockResolvedValue({ viewAll: true, viewCentre: true, conduct: true, manageTemplate: true });
  db.$transaction.mockResolvedValue([]);
});

describe("POST /api/inspections/[id]/submit", () => {
  it("401s without a session", async () => {
    session.mockResolvedValue(null);
    expect((await POST(req(), ctx)).status).toBe(401);
  });

  it("404s for an inspection that doesn't exist", async () => {
    db.inspection.findUnique.mockResolvedValue(null);
    expect((await POST(req(), ctx)).status).toBe(404);
  });

  it("refuses to submit someone else's inspection", async () => {
    db.inspection.findUnique.mockResolvedValue(inspection({}));
    session.mockResolvedValue({ user: { id: "u2", centreId: "c1", roleType: "SUPER_ADMIN" } });
    expect((await POST(req(), ctx)).status).toBe(403);
  });

  it("refuses to submit twice", async () => {
    db.inspection.findUnique.mockResolvedValue(inspection({ status: "SUBMITTED" }));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Already submitted");
  });

  it("422s while a question is unanswered, and says which", async () => {
    db.inspection.findUnique.mockResolvedValue(inspection({ questions: [question({ critical: true })] }));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.unanswered).toBe(1);
    expect(body.unansweredCritical).toEqual(["Fire exits clear"]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("422s when a failed critical item has no photo evidence", async () => {
    db.inspection.findUnique.mockResolvedValue(
      inspection({
        questions: [question({ critical: true })],
        answers: [{ questionId: "q1", answer: "no", entries: [{ note: "Blocked", who: null, photos: [] }] }],
      })
    );
    const res = await POST(req(), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).missingPhotos).toEqual(["Fire exits clear"]);
  });

  it("422s when an answer that needs a note has none", async () => {
    db.inspection.findUnique.mockResolvedValue(
      inspection({ answers: [{ questionId: "q1", answer: "no", entries: [] }] })
    );
    const res = await POST(req(), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).missingNotes).toEqual(["Fire exits clear"]);
  });

  it("submits a complete inspection and stores the server-computed score", async () => {
    db.inspection.findUnique.mockResolvedValue(
      inspection({ answers: [{ questionId: "q1", answer: "yes", entries: [] }] })
    );
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pct).toBe(100);
    expect(body.verdict.word).toBe("Good");

    // The score is written from the server's own computation, not the request.
    expect(db.inspection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUBMITTED", scorePct: 100, verdict: "Good" }) })
    );
    expect(db.inspectionAnswer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bucket: "WELL", scoreFraction: 1 }) })
    );
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "inspection.submit" }));
  });

  it("records a critical failure as a serious finding, not a high score", async () => {
    db.inspection.findUnique.mockResolvedValue(
      inspection({
        questions: [question({ critical: true }), question({ id: "q2", text: "Premises clean", type: "RATING" })],
        answers: [
          { questionId: "q1", answer: "no", entries: [{ note: "Blocked", who: null, photos: [{ url: "s3://x" }] }] },
          { questionId: "q2", answer: "pass", entries: [] },
        ],
      })
    );
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pct).toBe(50);
    expect(body.verdict.word).toBe("Serious finding");
    expect(body.criticalFails).toEqual(["Fire exits clear"]);
  });

  it("uses the inspection's own size, so a size-gated question can fail it", async () => {
    const passes = question({
      id: "p1",
      text: "Toilet passes",
      type: "NUMBER",
      critical: true,
      photoExempt: true,
      minBySize: { small: 2, medium: 4, large: 5 },
    });
    const answers = [{ questionId: "p1", answer: "3", entries: [{ note: "counted", who: null, photos: [] }] }];

    db.inspection.findUnique.mockResolvedValue(inspection({ size: "SMALL", questions: [passes], answers }));
    expect((await (await POST(req(), ctx)).json()).criticalFails).toEqual([]);

    db.inspection.findUnique.mockResolvedValue(inspection({ size: "LARGE", questions: [passes], answers }));
    const large = await (await POST(req(), ctx)).json();
    expect(large.criticalFails).toEqual(["Toilet passes"]);
    expect(large.verdict.word).toBe("Serious finding");
  });
});
