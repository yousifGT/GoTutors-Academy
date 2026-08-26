import { describe, it, expect } from "vitest";
import { buildReport, type ReportSource } from "./report";
import type { QuestionRow } from "./score";

const question = (over: Partial<QuestionRow> & { id: string; text: string }): QuestionRow => ({
  type: "RATING",
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

function source(over: Partial<ReportSource> = {}): ReportSource {
  return {
    centre: { name: "Acton" },
    inspector: { name: "R. Patel" },
    date: new Date("2026-08-26"),
    size: "SMALL",
    status: "SUBMITTED",
    activeMs: 5_400_000,
    scorePct: 50,
    verdict: "Needs attention",
    targets: null,
    debriefName: null,
    debriefRole: null,
    debriefNotes: null,
    debriefFeedback: null,
    debriefEmail: null,
    debriefSignatureUrl: null,
    template: {
      version: 13,
      sections: [
        {
          title: "Safeguarding",
          questions: [
            question({ id: "q1", text: "Fire exits clear", type: "YESNO", critical: true }),
            question({ id: "q2", text: "Premises clean" }),
          ],
        },
      ],
    },
    answers: [
      { questionId: "q1", answer: "no", entries: [{ note: "Blocked", who: null, photos: [{ url: "/uploads/photos/a.jpg" }] }] },
      { questionId: "q2", answer: "pass", entries: [] },
    ],
    ...over,
  };
}

describe("buildReport", () => {
  it("groups rows by what the reader must act on", () => {
    const r = buildReport(source());
    expect(r.groups.map((g) => g.key)).toEqual(["IMPROVE", "WELL"]);
    expect(r.groups[0].rows[0].question).toBe("Fire exits clear");
    expect(r.groups[0].rows[0].answer).toBe("No");
    expect(r.groups[0].rows[0].critical).toBe(true);
    expect(r.groups[1].rows[0].question).toBe("Premises clean");
  });

  it("omits a group with nothing in it", () => {
    const r = buildReport(source());
    expect(r.groups.some((g) => g.key === "OBS")).toBe(false);
  });

  it("carries the critical override, not just the percentage", () => {
    const r = buildReport(source());
    expect(r.criticalFails).toEqual(["Fire exits clear"]);
  });

  it("reports the score recorded at submission, not a recomputation", () => {
    // A submitted inspection is a record: if the checklist later changes, the
    // report must still show what the centre was actually told.
    const r = buildReport(source({ scorePct: 42, verdict: "Needs attention" }));
    expect(r.pct).toBe(42);
  });

  it("a draft reports where it currently stands", () => {
    const r = buildReport(source({ status: "DRAFT", scorePct: null, verdict: null }));
    expect(r.status).toBe("DRAFT");
    expect(r.pct).toBe(50); // one pass, one fail
    // The failed critical still overrides, draft or not.
    expect(r.verdict).toBe("Serious finding");
  });

  it("a clean draft reports the plain verdict", () => {
    const r = buildReport(
      source({
        status: "DRAFT",
        scorePct: null,
        verdict: null,
        answers: [
          { questionId: "q1", answer: "yes", entries: [] },
          { questionId: "q2", answer: "pass", entries: [] },
        ],
      })
    );
    expect(r.pct).toBe(100);
    expect(r.verdict).toBe("Good");
    expect(r.verdictColor).toBe("#2f855a");
  });

  it("colours the verdict that is actually shown", () => {
    const r = buildReport(source({ scorePct: 91, verdict: "Good" }));
    expect(r.pct).toBe(91);
    expect(r.verdictColor).toBe("#2f855a"); // not the live "Serious finding" red
  });

  it("keeps notes and photos with their question", () => {
    const r = buildReport(source());
    const row = r.groups[0].rows[0];
    expect(row.entries).toEqual([{ who: null, note: "Blocked", photos: ["/uploads/photos/a.jpg"] }]);
  });

  it("drops entries holding nothing", () => {
    const r = buildReport(
      source({
        answers: [
          { questionId: "q1", answer: "no", entries: [{ note: "  ", who: null, photos: [] }] },
          { questionId: "q2", answer: "pass", entries: [] },
        ],
      })
    );
    expect(r.groups[0].rows[0].entries).toEqual([]);
  });

  it("passes the checklist version through, so an old report stays readable", () => {
    expect(buildReport(source()).checklistVersion).toBe(13);
  });
});
