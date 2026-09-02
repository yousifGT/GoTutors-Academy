import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  ChecklistInput,
  blankQuestion,
  countOf,
  diffChecklists,
  normalise,
  normaliseQuestion,
  planSave,
  questionFromDb,
  questionRow,
  type Checklist,
  type ChecklistQuestion,
} from "./checklist";

const q = (over: Partial<ChecklistQuestion> = {}): ChecklistQuestion => ({ ...blankQuestion(), text: "A question", ...over });
const doc = (...questions: ChecklistQuestion[]): Checklist => ({ sections: [{ title: "Section", questions }] });

describe("planSave", () => {
  it("edits in place while nothing has been inspected against the version", () => {
    expect(planSave({ liveVersion: 13, highestVersion: 13, inspectionCount: 0 })).toEqual({
      mode: "in-place",
      version: 13,
    });
  });

  it("publishes the next version once the checklist has been used", () => {
    expect(planSave({ liveVersion: 13, highestVersion: 13, inspectionCount: 1 })).toEqual({
      mode: "new-version",
      version: 14,
      from: 13,
    });
  });

  it("counts a single draft as use — an inspector mid-visit keeps the questions they started with", () => {
    expect(planSave({ liveVersion: 1, highestVersion: 1, inspectionCount: 1 }).mode).toBe("new-version");
  });

  it("steps past an inactive higher version rather than colliding with it", () => {
    // The seed can leave v14 behind, deactivated, while v13 is live.
    // (name, version) is unique, so v13 + 1 would be refused by the database.
    expect(planSave({ liveVersion: 13, highestVersion: 14, inspectionCount: 3 })).toEqual({
      mode: "new-version",
      version: 15,
      from: 13,
    });
  });
});

describe("normaliseQuestion", () => {
  it("drops the settings a type does not read", () => {
    const out = normaliseQuestion({
      ...q({ type: "rating" }),
      options: ["a", "b"],
      min: 2,
      max: 9,
      unit: "books",
      scored: true,
      minBySize: { small: 4 },
      tally: "standups",
    });
    expect(out.options).toBeNull();
    expect(out.min).toBeNull();
    expect(out.max).toBeNull();
    expect(out.unit).toBeNull();
    expect(out.scored).toBe(false);
    expect(out.minBySize).toBeNull();
    expect(out.tally).toBeNull();
  });

  it("keeps a critical item's written-evidence exemption, and drops it when nothing is critical", () => {
    expect(normaliseQuestion(q({ critical: true, photoExempt: true })).photoExempt).toBe(true);
    expect(normaliseQuestion(q({ critical: false, photoExempt: true })).photoExempt).toBe(false);
  });

  it("trims and de-duplicates the options of a multiple choice", () => {
    const out = normaliseQuestion(q({ type: "choice", options: [" Positive ", "Neutral", "Positive", "  "] }));
    expect(out.options).toEqual(["Positive", "Neutral"]);
  });

  it("gives a scale the 1–5 bounds the rules assume when none are set", () => {
    const out = normaliseQuestion(q({ type: "scale" }));
    expect([out.min, out.max]).toEqual([1, 5]);
  });

  it("keeps a number's unit, size targets and session counter", () => {
    const out = normaliseQuestion(q({ type: "number", unit: "passes", minBySize: { small: 2, large: 6 }, tally: "distractions" }));
    expect(out.unit).toBe("passes");
    expect(out.minBySize).toEqual({ small: 2, large: 6 });
    expect(out.tally).toBe("distractions");
  });

  it("treats a size map with nothing in it as absent", () => {
    expect(normaliseQuestion(q({ type: "number", minBySize: {} })).minBySize).toBeNull();
    expect(normaliseQuestion(q({ sizeGuide: { small: { text: "   " } } })).sizeGuide).toBeNull();
  });

  it("throws away blank guidance bullets", () => {
    expect(normaliseQuestion(q({ dos: [" keep ", "", "  "] })).dos).toEqual(["keep"]);
    expect(normaliseQuestion(q({ donts: ["", " "] })).donts).toBeNull();
  });
});

describe("what the editor is not allowed to save", () => {
  const parse = (checklist: unknown) => ChecklistInput.safeParse(checklist);

  it("refuses a multiple choice nobody could answer", () => {
    const r = parse({ sections: [{ title: "S", questions: [{ text: "Pick", type: "choice", options: ["only"] }] }] });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("at least two options");
  });

  it("refuses two options that read the same", () => {
    const r = parse({ sections: [{ title: "S", questions: [{ text: "Pick", type: "choice", options: ["a", "a"] }] }] });
    expect(r.success).toBe(false);
  });

  it("refuses a scale that would divide by zero or run backwards", () => {
    // itemScore is (n - min) / (max - min).
    expect(parse({ sections: [{ title: "S", questions: [{ text: "R", type: "scale", min: 3, max: 3 }] }] }).success).toBe(false);
    expect(parse({ sections: [{ title: "S", questions: [{ text: "R", type: "scale", min: 5, max: 2 }] }] }).success).toBe(false);
  });

  it("refuses an empty checklist, an empty section and an unworded question", () => {
    expect(parse({ sections: [] }).success).toBe(false);
    expect(parse({ sections: [{ title: "S", questions: [] }] }).success).toBe(false);
    expect(parse({ sections: [{ title: "S", questions: [{ text: "  " }] }] }).success).toBe(false);
    expect(parse({ sections: [{ title: " ", questions: [{ text: "Q" }] }] }).success).toBe(false);
  });

  it("refuses a tally key the inspector's counter has no label for", () => {
    expect(parse({ sections: [{ title: "S", questions: [{ text: "Q", type: "number", tally: "coffees" }] }] }).success).toBe(false);
  });

  it("accepts the ordinary case, filling in the defaults", () => {
    const r = parse({ sections: [{ title: "Safety", questions: [{ text: "Fire exits clear?" }] }] });
    expect(r.success).toBe(true);
    const out = normalise(r.data!);
    expect(out.sections[0].questions[0]).toEqual({ ...blankQuestion(), text: "Fire exits clear?" });
  });
});

describe("a question through the database and back", () => {
  const unwrap = (row: ReturnType<typeof questionRow>) => ({
    ...row,
    options: row.options === Prisma.DbNull ? null : (row.options as string[]),
    dos: row.dos === Prisma.DbNull ? null : (row.dos as string[]),
    donts: row.donts === Prisma.DbNull ? null : (row.donts as string[]),
    sizeGuide: row.sizeGuide === Prisma.DbNull ? null : row.sizeGuide,
    minBySize: row.minBySize === Prisma.DbNull ? null : row.minBySize,
  });

  it("comes back as it went in", () => {
    const original = normaliseQuestion(
      q({
        text: "How many toilet passes are in circulation?",
        type: "number",
        unit: "passes",
        minBySize: { small: 2, medium: 4, large: 6 },
        tally: null,
        critical: true,
        photoExempt: true,
        allowNA: true,
        guide: "Count them.",
        dos: ["Count each one"],
        donts: ["Take the centre's word for it"],
        sizeGuide: { large: { text: "Expect six." } },
      })
    );
    const back = questionFromDb(unwrap(questionRow(original, 0)) as Parameters<typeof questionFromDb>[0]);
    expect(back).toEqual(original);
  });

  it("writes a SQL null rather than the JSON value null for an absent list", () => {
    // A plain `null` stores the JSON literal null, which reads back as a value
    // rather than an absence.
    expect(questionRow(q(), 0).options).toBe(Prisma.DbNull);
  });

  it("ignores a stored tally key the counter no longer knows about", () => {
    // The column is a plain string, so a key removed from TALLY_KEYS can still
    // be sitting in an old row. It must read back as no counter, not as one the
    // tally bar has no label or direction for.
    const row = unwrap(questionRow(q({ type: "number" }), 0)) as Parameters<typeof questionFromDb>[0];
    expect(questionFromDb({ ...row, tallyKey: "coffees" }).tally).toBeNull();
  });
});

describe("diffChecklists", () => {
  it("counts what was added, removed and edited", () => {
    const before = doc(q({ text: "Kept" }), q({ text: "Changed" }), q({ text: "Gone" }));
    const after = doc(q({ text: "Kept" }), q({ text: "Changed", critical: true }), q({ text: "New" }));
    expect(diffChecklists(before, after)).toEqual({
      sectionsAdded: [],
      sectionsRemoved: [],
      added: 1,
      removed: 1,
      edited: 1,
    });
  });

  it("names the sections either side", () => {
    const before: Checklist = { sections: [{ title: "Safety", questions: [q()] }] };
    const after: Checklist = { sections: [{ title: "Safeguarding", questions: [q()] }] };
    const d = diffChecklists(before, after);
    expect(d.sectionsAdded).toEqual(["Safeguarding"]);
    expect(d.sectionsRemoved).toEqual(["Safety"]);
    // The question itself moved section but is unchanged, so it is not an edit.
    expect([d.added, d.removed, d.edited]).toEqual([0, 0, 0]);
  });

  it("reads a rewritten question as a replacement, because the wording is the question", () => {
    const d = diffChecklists(doc(q({ text: "Old wording" })), doc(q({ text: "New wording" })));
    expect([d.added, d.removed, d.edited]).toEqual([1, 1, 0]);
  });
});

describe("countOf", () => {
  it("counts sections, questions and critical items", () => {
    expect(countOf({ sections: [{ title: "A", questions: [q(), q({ critical: true })] }, { title: "B", questions: [q()] }] })).toEqual({
      sections: 2,
      questions: 3,
      critical: 1,
    });
  });
});

describe("diffChecklists does not invent edits", () => {
  it("ignores the key order a jsonb column reads back in", () => {
    // Postgres returns jsonb object keys in its own order, so the same size
    // guidance comes back as {large, small} where this code writes it as
    // {small, large}. Comparing the serialised text reported both questions on
    // a faithful version copy as edited.
    const stored = q({ sizeGuide: { large: { text: "Six." }, small: { text: "Two." } } as never });
    const written = q({ sizeGuide: { small: { text: "Two." }, large: { text: "Six." } } });
    expect(diffChecklists(doc(stored), doc(written)).edited).toBe(0);
  });

  it("still notices a size target that actually moved", () => {
    const before = q({ type: "number", minBySize: { small: 2, large: 6 } });
    const after = q({ type: "number", minBySize: { large: 8, small: 2 } });
    expect(diffChecklists(doc(before), doc(after)).edited).toBe(1);
  });
});

describe("two questions worded the same", () => {
  it("are refused, because a repeat finding is matched to the last visit by wording", () => {
    const r = ChecklistInput.safeParse({
      sections: [
        { title: "Ground floor", questions: [{ text: "Are the toilets clean?" }] },
        { title: "First floor", questions: [{ text: "Are the toilets clean?" }] },
      ],
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("worded the same");
  });

  it("catches it regardless of case and surrounding space", () => {
    const r = ChecklistInput.safeParse({
      sections: [{ title: "S", questions: [{ text: "Fire exits clear?" }, { text: "  fire exits CLEAR?  " }] }],
    });
    expect(r.success).toBe(false);
  });

  it("leaves distinguishable wording alone", () => {
    const r = ChecklistInput.safeParse({
      sections: [
        { title: "Ground floor", questions: [{ text: "Are the ground-floor toilets clean?" }] },
        { title: "First floor", questions: [{ text: "Are the first-floor toilets clean?" }] },
      ],
    });
    expect(r.success).toBe(true);
  });
});

describe("the checklist GoTutors actually uses", () => {
  it("round-trips through the editor's rules unchanged", async () => {
    // If the shipped checklist cannot be re-saved, the editor is useless: the
    // first thing anyone does is open it and change one question.
    const seed = (await import("../../data/gotutors-seed.json")).default as {
      config: { template: { title: string; items: unknown[] }[] };
    };
    const wire = { sections: seed.config.template.map((s) => ({ title: s.title, questions: s.items })) };
    const parsed = ChecklistInput.safeParse(wire);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);

    const out = normalise(parsed.data!);
    const counts = countOf(out);
    expect(counts).toEqual({ sections: 15, questions: 101, critical: 8 });

    // And saving it back changes nothing: normalisation must be a no-op on a
    // checklist that is already well-formed, or every publish would quietly
    // rewrite questions nobody touched.
    expect(diffChecklists(out, normalise(ChecklistInput.parse(wire)))).toEqual({
      sectionsAdded: [],
      sectionsRemoved: [],
      added: 0,
      removed: 0,
      edited: 0,
    });
  });
});
