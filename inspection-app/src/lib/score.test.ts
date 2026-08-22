import { describe, it, expect } from "vitest";
import {
  canSubmit,
  scoreDbInspection,
  toCoreItem,
  toCoreSize,
  toCoreType,
  toDbBucket,
  toDbSize,
  toDbType,
  type AnswerRow,
  type QuestionRow,
  type SectionRow,
} from "@/lib/score";

function question(over: Partial<QuestionRow> & { id: string; text: string }): QuestionRow {
  return {
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
  };
}

const answer = (questionId: string, value: string | null, entries: AnswerRow["entries"] = []): AnswerRow => ({
  questionId,
  answer: value,
  entries,
});

const note = (text: string, photos: string[] = []) => ({ note: text, who: null, photos: photos.map((url) => ({ url })) });

describe("enum mapping", () => {
  it("round-trips question types", () => {
    for (const t of ["RATING", "YESNO", "SCALE", "NUMBER", "CHOICE"] as const) {
      expect(toDbType(toCoreType(t))).toBe(t);
    }
  });

  it("round-trips centre sizes", () => {
    for (const s of ["SMALL", "MEDIUM", "LARGE"] as const) {
      expect(toDbSize(toCoreSize(s))).toBe(s);
    }
    expect(toDbSize("")).toBeNull();
  });

  it("maps buckets to the database enum", () => {
    expect(toDbBucket("well")).toBe("WELL");
    expect(toDbBucket("improve")).toBe("IMPROVE");
    expect(toDbBucket("obs")).toBe("OBS");
    expect(toDbBucket("skip")).toBe("SKIP");
  });
});

describe("toCoreItem", () => {
  it("carries the flags and JSON columns the rules read", () => {
    const q = question({
      id: "q1",
      text: "Toilet passes",
      type: "NUMBER",
      unit: "passes",
      minBySize: { small: 2, medium: 4, large: 5 },
      sizeGuide: { small: { text: "Small: 2." } },
      dos: ["a"],
      donts: ["b"],
      tallyKey: "standups",
    });
    const item = toCoreItem(q, answer("q1", "3", [note("counted", ["s3://p.jpg"])]));
    expect(item.type).toBe("number");
    expect(item.minBySize).toEqual({ small: 2, medium: 4, large: 5 });
    expect(item.dos).toEqual(["a"]);
    expect(item.tally).toBe("standups");
    expect(item.answer).toBe("3");
    expect(item.entries).toEqual([{ note: "counted", who: "", photos: ["s3://p.jpg"] }]);
  });

  it("leaves an unanswered question blank rather than guessing", () => {
    const item = toCoreItem(question({ id: "q1", text: "t" }));
    expect(item.answer).toBeNull();
    expect(item.entries).toEqual([]);
  });

  it("ignores a JSON column that isn't a string array", () => {
    const item = toCoreItem(question({ id: "q1", text: "t", options: { not: "an array" }, dos: 7 }));
    expect(item.options).toBeNull();
    expect(item.dos).toBeNull();
  });
});

describe("scoreDbInspection", () => {
  const sections: SectionRow[] = [
    {
      title: "Safeguarding",
      questions: [
        question({ id: "q1", text: "Fire exits clear", type: "YESNO", critical: true }),
        question({ id: "q2", text: "DBS confirmed", type: "YESNO", critical: true, photoExempt: true }),
        question({ id: "q3", text: "Premises clean" }),
      ],
    },
  ];

  it("scores, buckets and reports what is still owed", () => {
    const r = scoreDbInspection(
      sections,
      [answer("q1", "yes"), answer("q2", "yes"), answer("q3", "pass")],
      "SMALL"
    );
    expect(r.pct).toBe(100);
    expect(r.verdict.word).toBe("Good");
    expect(r.answers.map((a) => a.bucket)).toEqual(["WELL", "WELL", "WELL"]);
    expect(canSubmit(r)).toBe(true);
  });

  it("a failed critical item overrides the verdict and demands evidence", () => {
    const r = scoreDbInspection(
      sections,
      [answer("q1", "no"), answer("q2", "yes"), answer("q3", "pass")],
      "SMALL"
    );
    expect(r.verdict.word).toBe("Serious finding");
    expect(r.criticalFails).toEqual(["Fire exits clear"]);
    expect(r.missingNotes).toEqual(["Fire exits clear"]);
    expect(r.missingPhotos).toEqual(["Fire exits clear"]);
    expect(canSubmit(r)).toBe(false);
  });

  it("a photo-exempt critical fail needs a note but no photo", () => {
    const r = scoreDbInspection(
      sections,
      [answer("q1", "yes"), answer("q2", "no", [note("Two staff missing from the register")]), answer("q3", "pass")],
      "SMALL"
    );
    expect(r.criticalFails).toEqual(["DBS confirmed"]);
    expect(r.missingNotes).toEqual([]);
    expect(r.missingPhotos).toEqual([]);
    expect(canSubmit(r)).toBe(true); // written up, as the checklist requires
  });

  it("a supplied note and photo clear the outstanding items", () => {
    const r = scoreDbInspection(
      sections,
      [
        answer("q1", "no", [note("Boxes across the rear exit", ["s3://exit.jpg"])]),
        answer("q2", "yes"),
        answer("q3", "pass"),
      ],
      "SMALL"
    );
    expect(r.missingNotes).toEqual([]);
    expect(r.missingPhotos).toEqual([]);
    expect(canSubmit(r)).toBe(true);
  });

  it("counts unanswered questions and blocks submission", () => {
    const r = scoreDbInspection(sections, [answer("q1", "yes")], "SMALL");
    expect(r.unanswered).toBe(2);
    expect(r.unansweredCritical).toEqual(["DBS confirmed"]);
    expect(canSubmit(r)).toBe(false);
  });

  it("size decides the bucket of a number question, and can flip the verdict", () => {
    const passes: SectionRow[] = [
      {
        title: "Classroom",
        questions: [
          question({
            id: "p1",
            text: "Toilet passes",
            type: "NUMBER",
            unit: "passes",
            critical: true,
            photoExempt: true,
            minBySize: { small: 2, medium: 4, large: 5 },
          }),
        ],
      },
    ];
    const three = [answer("p1", "3", [note("counted on arrival")])];

    const small = scoreDbInspection(passes, three, "SMALL");
    expect(small.answers[0].bucket).toBe("OBS");
    expect(small.verdict.word).toBe("Needs attention"); // nothing scored, but nothing critical either
    expect(small.criticalFails).toEqual([]);

    const large = scoreDbInspection(passes, three, "LARGE");
    expect(large.answers[0].bucket).toBe("IMPROVE");
    expect(large.criticalFails).toEqual(["Toilet passes"]);
    expect(large.verdict.word).toBe("Serious finding");
  });

  it("stores a score fraction only for questions that count", () => {
    const mixed: SectionRow[] = [
      {
        title: "Mixed",
        questions: [
          question({ id: "a", text: "rating" }),
          question({ id: "b", text: "number", type: "NUMBER" }),
          question({ id: "c", text: "na", allowNA: true }),
        ],
      },
    ];
    const r = scoreDbInspection(mixed, [answer("a", "improve", [note("x")]), answer("b", "7"), answer("c", "na")], "SMALL");
    expect(r.answers.map((a) => a.scoreFraction)).toEqual([0.5, null, null]);
    expect(r.scored).toBe(1);
    expect(r.pct).toBe(50);
  });
});
