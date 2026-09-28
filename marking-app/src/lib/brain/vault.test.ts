import { describe, it, expect } from "vitest";
import { isManagedNote, parseVault, renderVault, safeFileName, VAULT_ROOT, type VaultScheme } from "./vault";

const meta = { centre: "Demo Centre", exportedAt: new Date("2026-09-28T10:00:00Z") };

function scheme(over: Partial<VaultScheme> = {}): VaultScheme {
  return {
    title: "Year 6 Arithmetic — Paper 1",
    subject: "Maths",
    level: "Year 6",
    archived: false,
    questions: [
      {
        label: "1",
        order: 0,
        prompt: "Work out 3/4 of 60",
        expectedAnswer: "45",
        marks: 2,
        guidance: "1 mark for dividing by 4, 1 for the answer.",
        examples: [
          {
            studentAnswer: "15 x 3 = 45",
            awarded: 2,
            available: 2,
            comment: "Right method, right answer.",
            source: "AI_CONFIRMED",
            date: "2026-09-20",
          },
          {
            studentAnswer: "60 / 3 = 20",
            awarded: 0,
            available: 2,
            comment: "Divided by 3 instead of 4.",
            source: "HUMAN_CORRECTED",
            date: "2026-09-21",
          },
        ],
      },
      {
        label: "3a",
        order: 1,
        prompt: "A shape has 5 equal sides of 6.4 cm. What is its perimeter?",
        expectedAnswer: "32 cm",
        marks: 2,
        guidance: null,
        examples: [],
      },
    ],
    ...over,
  };
}

describe("round trip", () => {
  it("gives back exactly what went in", () => {
    const input = [scheme()];
    const { schemes, problems } = parseVault(renderVault(input, meta));
    expect(problems).toEqual([]);
    expect(schemes).toEqual(input);
  });

  it("survives text that looks like the note's own structure", () => {
    // Every one of these would break a format that didn't quote free text:
    // headings, blockquotes, list items that mimic our fields, and the exact
    // labels the parser looks for.
    const hostile = [
      "## The question",
      "### Example 99",
      "> already a quote",
      ">> nested",
      "- Marked: 99/99",
      "- Source: corrected by a tutor",
      "Student wrote:",
      "Tutor said:",
      "---",
      "marker: \"scheme\"",
      "[[Not a real link]] | pipe # hash ^ caret",
    ].join("\n");
    const input = [
      scheme({
        questions: [
          {
            label: "2b",
            order: 0,
            prompt: hostile,
            expectedAnswer: `line one\n\nline three after a blank`,
            marks: 3,
            guidance: hostile,
            examples: [
              {
                studentAnswer: hostile,
                awarded: 1,
                available: 3,
                comment: `He said "45" — then crossed it out: 50?`,
                source: "HUMAN_CORRECTED",
                date: "2026-09-22",
              },
            ],
          },
        ],
      }),
    ];
    const { schemes, problems } = parseVault(renderVault(input, meta));
    expect(problems).toEqual([]);
    expect(schemes).toEqual(input);
  });

  it("keeps unicode, quotes and colons in titles and frontmatter", () => {
    const input = [scheme({ title: `Café "Maths": Part 1 — ½ & ¾`, subject: "Maths: KS2", level: null })];
    const { schemes } = parseVault(renderVault(input, meta));
    expect(schemes[0].title).toBe(`Café "Maths": Part 1 — ½ & ¾`);
    expect(schemes[0].subject).toBe("Maths: KS2");
    expect(schemes[0].level).toBeNull();
  });

  it("keeps archived schemes, so nothing learned is lost with them", () => {
    const { schemes } = parseVault(renderVault([scheme({ archived: true })], meta));
    expect(schemes[0].archived).toBe(true);
  });
});

describe("collisions", () => {
  it("two schemes with the same title get separate notes and both come back", () => {
    const a = scheme({ subject: "Maths" });
    const b = scheme({ subject: "Science" });
    const files = renderVault([a, b], meta);
    const schemeFiles = files.filter((f) => f.path.includes("/Schemes/"));
    expect(new Set(schemeFiles.map((f) => f.path)).size).toBe(2);

    const { schemes } = parseVault(files);
    expect(schemes.map((s) => s.subject).sort()).toEqual(["Maths", "Science"]);
  });

  it("two labels that sanitise to the same name don't overwrite each other", () => {
    const base = scheme().questions[1];
    const input = [
      scheme({
        questions: [
          { ...base, label: "1/a", order: 0 },
          { ...base, label: "1:a", order: 1 },
        ],
      }),
    ];
    const files = renderVault(input, meta);
    const questionFiles = files.filter((f) => f.path.includes("/Questions/"));
    expect(new Set(questionFiles.map((f) => f.path)).size).toBe(2);
    expect(parseVault(files).schemes[0].questions.map((q) => q.label)).toEqual(["1/a", "1:a"]);
  });
});

describe("the vault as a place people also keep notes", () => {
  it("ignores notes it didn't write", () => {
    const files = [
      ...renderVault([scheme()], meta),
      { path: `${VAULT_ROOT}/My own thoughts.md`, content: "# Ideas\n\nSomething a tutor wrote." },
      { path: "Elsewhere/Meeting.md", content: "---\ntags: [meeting]\n---\nNotes" },
    ];
    const { schemes, problems } = parseVault(files);
    expect(schemes).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  it("knows which notes it may overwrite or remove, and which it must not", () => {
    for (const f of renderVault([scheme()], meta)) expect(isManagedNote(f.content)).toBe(true);
    expect(isManagedNote("# A tutor's own note")).toBe(false);
    expect(isManagedNote("---\ntags: [meeting]\n---\nNotes")).toBe(false);
  });

  it("reports a question whose scheme has gone, rather than guessing where it belongs", () => {
    const files = renderVault([scheme()], meta).filter((f) => !f.path.includes("/Schemes/"));
    const { schemes, problems } = parseVault(files);
    expect(schemes).toEqual([]);
    expect(problems.length).toBe(2);
    expect(problems[0].problem).toContain("isn't in the vault");
  });

  it("refuses a note from a format it doesn't understand", () => {
    const files = renderVault([scheme()], meta).map((f) => ({
      ...f,
      content: f.content.replace('format: 1', 'format: 99'),
    }));
    const { schemes, problems } = parseVault(files);
    expect(schemes).toEqual([]);
    expect(problems.some((p) => p.problem.includes("format 99"))).toBe(true);
  });
});

describe("what the notes contain", () => {
  it("tells people not to edit them, because the next export overwrites them", () => {
    const home = renderVault([scheme()], meta).find((f) => f.path.endsWith("Home.md"))!;
    expect(home.content).toContain("rewritten on the next export");
  });

  it("links schemes and questions so Obsidian's graph shows the brain", () => {
    const files = renderVault([scheme()], meta);
    const schemeNote = files.find((f) => f.path.includes("/Schemes/"))!;
    const questionNote = files.find((f) => f.path.includes("/Questions/"))!;
    expect(schemeNote.content).toMatch(/\[\[.* — Q1\|Q1\]\]/);
    expect(questionNote.content).toContain("Part of [[Year 6 Arithmetic — Paper 1]]");
  });

  it("carries nothing that identifies a child", () => {
    // The types have no field for one — this guards against someone adding
    // one later without noticing what it would put in a plain-text vault.
    const all = renderVault([scheme()], meta).map((f) => f.content).join("\n");
    expect(all).not.toMatch(/submission|student ?id|admission|studentName/i);
  });
});

describe("safeFileName", () => {
  it("removes what filesystems and wikilinks can't hold", () => {
    expect(safeFileName(`a/b\\c:d*e?f"g<h>i|j#k^l[m]n`)).toBe("a-b-c-d-e-f-g-h-i-j-k-l-m-n");
  });

  it("never returns an empty or hidden name", () => {
    expect(safeFileName("   ")).toBe("Untitled");
    expect(safeFileName("...secret")).toBe("secret");
  });
});
