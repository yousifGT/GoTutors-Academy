/**
 * The brain as an Obsidian vault.
 *
 * Everything the marker has learned — mark schemes, their questions, and every
 * worked example a tutor checked or corrected — written out as plain Markdown
 * notes. The point is ownership: the learning already lives in this app's own
 * database rather than inside any AI provider, so switching provider costs
 * nothing. The vault goes one step further and makes it independent of this app
 * and this database too. Open files on the centre's own machine, readable by a
 * person, and restorable into a fresh install with `npm run brain:import`.
 *
 * Two rules shape the format:
 *
 *  - It must round-trip losslessly. `parseVault(renderVault(x))` gives back `x`,
 *    and a test holds it to that. Every piece of free text — a child's answer, a
 *    tutor's comment, a question — is written as a blockquote, so nothing a
 *    person typed can be mistaken for the note's own structure, however many
 *    `#` or `>` characters it contains.
 *  - It must not identify children. Examples carry the answer, the mark and the
 *    comment, never the student or the paper they came from. (A child who
 *    wrote their name in an answer box is the one thing no format can prevent.)
 *
 * Pure: no filesystem, no database. The export and import scripts do the I/O.
 */

export const VAULT_FORMAT = 1;
export const VAULT_ROOT = "Marker Brain";

export type VaultExample = {
  studentAnswer: string;
  awarded: number;
  available: number;
  comment: string;
  source: "AI_CONFIRMED" | "HUMAN_CORRECTED";
  /** YYYY-MM-DD. */
  date: string;
};

export type VaultQuestion = {
  label: string;
  order: number;
  prompt: string;
  expectedAnswer: string;
  marks: number;
  guidance: string | null;
  examples: VaultExample[];
};

export type VaultScheme = {
  title: string;
  subject: string;
  level: string | null;
  archived: boolean;
  questions: VaultQuestion[];
};

export type VaultFile = { path: string; content: string };

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/**
 * A title made safe as a note name.
 *
 * Obsidian note names end up as filenames and inside `[[links]]`, so they lose
 * anything a filesystem or a wikilink would choke on. The original title is kept
 * in the note's frontmatter, which is what the importer reads.
 */
export function safeFileName(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|#^[\]]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return (cleaned || "Untitled").slice(0, 120);
}

/**
 * One note name per scheme, unique even when two schemes share a title.
 *
 * Titles are not unique in the database, and two notes with the same name would
 * overwrite each other on disk — silently losing a whole scheme's learning.
 */
function schemeNoteNames(schemes: VaultScheme[]): string[] {
  const seen = new Map<string, number>();
  return schemes.map((s) => {
    const base = safeFileName(s.title);
    const count = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

/**
 * Note names for a scheme's questions, unique within the scheme.
 *
 * Labels are unique in the database, but sanitising can merge two of them —
 * "1/a" and "1:a" both become "1-a" — and the second would silently overwrite
 * the first on disk. Same guard as for scheme titles.
 */
function questionNoteNames(schemeNote: string, questions: VaultQuestion[]): string[] {
  const seen = new Map<string, number>();
  return questions.map((q) => {
    const base = safeFileName(`${schemeNote} — Q${q.label}`);
    const count = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

type Scalar = string | number | boolean | null;

/**
 * JSON-encoded values are valid YAML, so Obsidian shows them as Properties and
 * the importer reads them back with `JSON.parse` — no YAML parser needed, and no
 * guessing whether `3a` or `yes` was meant as a string.
 */
function frontmatter(values: Record<string, Scalar>): string {
  const lines = Object.entries(values).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return ["---", ...lines, "---"].join("\n");
}

function readFrontmatter(content: string): Record<string, Scalar> | null {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(content);
  if (!match) return null;
  const values: Record<string, Scalar> = {};
  for (const line of match[1].split("\n")) {
    const at = line.indexOf(": ");
    if (at < 0) continue;
    try {
      values[line.slice(0, at)] = JSON.parse(line.slice(at + 2));
    } catch {
      // A line someone edited by hand into something unparseable is skipped,
      // not fatal — the fields the importer needs are checked explicitly.
    }
  }
  return values;
}

/** True for a note this exporter wrote — and so may overwrite or remove. */
export function isManagedNote(content: string): boolean {
  const fm = readFrontmatter(content);
  return typeof fm?.marker === "string";
}

// ---------------------------------------------------------------------------
// Blockquotes — the one encoding for every piece of human-written text
// ---------------------------------------------------------------------------

function quote(text: string): string {
  const lines = text.trim().split("\n");
  return lines.map((l) => (l.length ? `> ${l}` : ">")).join("\n");
}

function unquote(lines: string[]): string {
  return lines
    .map((l) => (l.startsWith("> ") ? l.slice(2) : l === ">" ? "" : l.replace(/^>/, "")))
    .join("\n")
    .trim();
}

/** The consecutive blockquote lines starting at `start`. */
function takeQuote(lines: string[], start: number): { text: string; next: number } {
  let i = start;
  const collected: string[] = [];
  while (i < lines.length && lines[i].startsWith(">")) collected.push(lines[i++]);
  return { text: unquote(collected), next: i };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<VaultExample["source"], string> = {
  HUMAN_CORRECTED: "corrected by a tutor",
  AI_CONFIRMED: "confirmed by a tutor",
};

function renderQuestion(scheme: VaultScheme, schemeNote: string, q: VaultQuestion): string {
  const corrected = q.examples.filter((e) => e.source === "HUMAN_CORRECTED").length;
  const parts = [
    frontmatter({
      marker: "question",
      format: VAULT_FORMAT,
      scheme: schemeNote,
      label: q.label,
      order: q.order,
      marks: q.marks,
    }),
    "",
    `# Q${q.label} · ${scheme.title}`,
    "",
    `Part of [[${schemeNote}]] · ${q.marks} mark${q.marks === 1 ? "" : "s"}`,
    "",
    "## The question",
    quote(q.prompt),
    "",
    "## Expected answer",
    quote(q.expectedAnswer),
  ];
  if (q.guidance?.trim()) parts.push("", "## How to award marks", quote(q.guidance));

  parts.push(
    "",
    "## Worked examples",
    q.examples.length === 0
      ? "Nothing learned for this question yet."
      : `${q.examples.length} kept · ${corrected} ${corrected === 1 ? "was a correction" : "were corrections"} by a tutor`
  );

  q.examples.forEach((e, i) => {
    parts.push(
      "",
      `### Example ${i + 1}`,
      `- Marked: ${e.awarded}/${e.available}`,
      `- Source: ${SOURCE_LABEL[e.source]}`,
      `- Date: ${e.date}`,
      "",
      "Student wrote:",
      quote(e.studentAnswer),
      "",
      "Tutor said:",
      quote(e.comment || "(no comment)")
    );
  });

  return parts.join("\n") + "\n";
}

function renderScheme(scheme: VaultScheme, schemeNote: string, questionNotes: string[]): string {
  const examples = scheme.questions.reduce((n, q) => n + q.examples.length, 0);
  const lines = [
    frontmatter({
      marker: "scheme",
      format: VAULT_FORMAT,
      title: scheme.title,
      subject: scheme.subject,
      level: scheme.level,
      archived: scheme.archived,
    }),
    "",
    `# ${scheme.title}`,
    "",
    `${scheme.subject}${scheme.level ? ` · ${scheme.level}` : ""}${scheme.archived ? " · archived" : ""}`,
    "",
    `${scheme.questions.length} questions · ${examples} worked examples learned`,
    "",
    "## Questions",
    ...scheme.questions
      .map((q, i) => ({ q, note: questionNotes[i] }))
      .sort((a, b) => a.q.order - b.q.order)
      .map(({ q, note }) => `- [[${note}|Q${q.label}]] — ${q.examples.length} examples`),
  ];
  return lines.join("\n") + "\n";
}

function renderHome(schemes: VaultScheme[], names: string[], meta: { centre: string; exportedAt: Date }): string {
  const examples = schemes.reduce((n, s) => n + s.questions.reduce((m, q) => m + q.examples.length, 0), 0);
  const corrections = schemes.reduce(
    (n, s) => n + s.questions.reduce((m, q) => m + q.examples.filter((e) => e.source === "HUMAN_CORRECTED").length, 0),
    0
  );
  return (
    [
      frontmatter({ marker: "home", format: VAULT_FORMAT, centre: meta.centre, exportedAt: meta.exportedAt.toISOString() }),
      "",
      `# ${meta.centre} — marking brain`,
      "",
      `Exported ${meta.exportedAt.toISOString().slice(0, 16).replace("T", " ")} UTC · ${schemes.length} mark schemes · ${examples} worked examples · ${corrections} tutor corrections`,
      "",
      "> [!warning] Don't edit these notes",
      "> Every note in this folder is rewritten on the next export. Change marking in the app, and add your own notes outside this folder.",
      "",
      "## Mark schemes",
      ...schemes.map((s, i) => `- [[${names[i]}]]${s.archived ? " (archived)" : ""}`),
    ].join("\n") + "\n"
  );
}

export function renderVault(schemes: VaultScheme[], meta: { centre: string; exportedAt: Date }): VaultFile[] {
  const names = schemeNoteNames(schemes);
  const files: VaultFile[] = [{ path: `${VAULT_ROOT}/Home.md`, content: renderHome(schemes, names, meta) }];
  schemes.forEach((scheme, i) => {
    const questionNotes = questionNoteNames(names[i], scheme.questions);
    files.push({ path: `${VAULT_ROOT}/Schemes/${names[i]}.md`, content: renderScheme(scheme, names[i], questionNotes) });
    scheme.questions.forEach((q, j) => {
      files.push({ path: `${VAULT_ROOT}/Questions/${questionNotes[j]}.md`, content: renderQuestion(scheme, names[i], q) });
    });
  });
  return files;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/** The lines under a `## heading`, up to the next `## `. Blockquotes can't start with `#`. */
function section(lines: string[], heading: string): string[] | null {
  const start = lines.indexOf(`## ${heading}`);
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith("## ")) end++;
  return lines.slice(start + 1, end);
}

function quotedSection(lines: string[], heading: string): string | null {
  const body = section(lines, heading);
  if (!body) return null;
  const first = body.findIndex((l) => l.startsWith(">"));
  return first < 0 ? "" : takeQuote(body, first).text;
}

function parseExamples(lines: string[]): VaultExample[] {
  const body = section(lines, "Worked examples") ?? [];
  const examples: VaultExample[] = [];
  let i = 0;
  while (i < body.length) {
    if (!body[i].startsWith("### Example")) {
      i++;
      continue;
    }
    i++;
    let awarded = 0;
    let available = 0;
    let source: VaultExample["source"] = "AI_CONFIRMED";
    let date = "";
    let studentAnswer = "";
    let comment = "";

    while (i < body.length && !body[i].startsWith("### ")) {
      const line = body[i];
      const marked = /^- Marked: (\d+)\/(\d+)$/.exec(line);
      if (marked) {
        awarded = Number(marked[1]);
        available = Number(marked[2]);
      } else if (line.startsWith("- Source: ")) {
        source = line.slice(10) === SOURCE_LABEL.HUMAN_CORRECTED ? "HUMAN_CORRECTED" : "AI_CONFIRMED";
      } else if (line.startsWith("- Date: ")) {
        date = line.slice(8);
      } else if (line === "Student wrote:") {
        const q = takeQuote(body, i + 1);
        studentAnswer = q.text;
        i = q.next;
        continue;
      } else if (line === "Tutor said:") {
        const q = takeQuote(body, i + 1);
        comment = q.text === "(no comment)" ? "" : q.text;
        i = q.next;
        continue;
      }
      i++;
    }
    examples.push({ studentAnswer, awarded, available, comment, source, date });
  }
  return examples;
}

export type ParseProblem = { path: string; problem: string };

/**
 * Read a vault back into schemes.
 *
 * Files without this exporter's frontmatter are ignored — a tutor's own notes
 * living in the same vault are none of the importer's business. A question note
 * whose scheme note is missing is reported, not guessed at.
 */
export function parseVault(files: VaultFile[]): { schemes: VaultScheme[]; problems: ParseProblem[] } {
  const problems: ParseProblem[] = [];
  const schemes = new Map<string, VaultScheme>();
  const questions: { schemeNote: string; q: VaultQuestion; path: string }[] = [];

  for (const file of files) {
    const fm = readFrontmatter(file.content);
    if (!fm || typeof fm.marker !== "string") continue;
    if (fm.format !== VAULT_FORMAT) {
      problems.push({ path: file.path, problem: `written in format ${String(fm.format)}; this importer reads ${VAULT_FORMAT}` });
      continue;
    }
    const lines = file.content.split("\n");
    const noteName = file.path.split("/").pop()!.replace(/\.md$/, "");

    if (fm.marker === "scheme") {
      schemes.set(noteName, {
        title: String(fm.title ?? noteName),
        subject: String(fm.subject ?? ""),
        level: typeof fm.level === "string" ? fm.level : null,
        archived: fm.archived === true,
        questions: [],
      });
    } else if (fm.marker === "question") {
      questions.push({
        schemeNote: String(fm.scheme ?? ""),
        path: file.path,
        q: {
          label: String(fm.label ?? ""),
          order: typeof fm.order === "number" ? fm.order : 0,
          marks: typeof fm.marks === "number" ? fm.marks : 1,
          prompt: quotedSection(lines, "The question") ?? "",
          expectedAnswer: quotedSection(lines, "Expected answer") ?? "",
          guidance: quotedSection(lines, "How to award marks"),
          examples: parseExamples(lines),
        },
      });
    }
  }

  for (const { schemeNote, q, path } of questions) {
    const scheme = schemes.get(schemeNote);
    if (!scheme) {
      problems.push({ path, problem: `belongs to mark scheme "${schemeNote}", which isn't in the vault` });
      continue;
    }
    scheme.questions.push(q);
  }
  for (const scheme of schemes.values()) scheme.questions.sort((a, b) => a.order - b.order);

  return { schemes: [...schemes.values()], problems };
}
