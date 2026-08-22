/**
 * node --test inspection-app/core/
 *
 * inspection-core.js ships as-is from the handoff and is the one source of truth
 * for scoring. These lock its rules so a refactor can't quietly move a pass mark,
 * drop a photo requirement, or lose the critical override.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const core = require("./inspection-core.js");

const seed = JSON.parse(readFileSync(path.join(__dirname, "../data/gotutors-seed.json"), "utf8"));

/** An answered item: a template question plus the fields an inspection adds. */
const item = (extra) =>
  Object.assign({ text: "t", type: "rating", answer: null, entries: [{ note: "", photos: [] }] }, extra);

/** Turn the seeded template into a blank, answerable inspection. */
function blankSections() {
  return seed.config.template.map((s) => ({
    title: s.title,
    items: s.items.map((it) => Object.assign({}, it, { answer: null, entries: [{ note: "", who: "", photos: [] }] })),
  }));
}

const allItems = (sections) => sections.flatMap((s) => s.items);

test("rating scores pass 1, improve 0.5, fail 0", () => {
  assert.equal(core.itemScore(item({ answer: "pass" })), 1);
  assert.equal(core.itemScore(item({ answer: "improve" })), 0.5);
  assert.equal(core.itemScore(item({ answer: "fail" })), 0);
});

test("unanswered and N/A are excluded from the score", () => {
  assert.equal(core.itemScore(item({ answer: null })), null);
  assert.equal(core.itemScore(item({ answer: "" })), null);
  assert.equal(core.itemScore(item({ answer: undefined })), null);
  assert.equal(core.itemScore(item({ answer: "na", allowNA: true })), null);
  assert.equal(core.bucketOf(item({ answer: "na", allowNA: true })), "skip");
});

test("a scale normalises across its own min and max", () => {
  const sc = (answer) => item({ type: "scale", min: 1, max: 5, answer });
  assert.equal(core.itemScore(sc("1")), 0);
  assert.equal(core.itemScore(sc("3")), 0.5);
  assert.equal(core.itemScore(sc("5")), 1);
});

test("a scored choice ranks best-first; an unscored one is an observation", () => {
  const opts = ["Yes", "Some disruption", "Too much disruption"];
  const ch = (answer) => item({ type: "choice", scored: true, options: opts, answer });
  assert.equal(core.itemScore(ch("Yes")), 1);
  assert.equal(core.itemScore(ch("Some disruption")), 0.5);
  assert.equal(core.itemScore(ch("Too much disruption")), 0);

  const unscored = item({ type: "choice", options: ["A", "B"], answer: "A" });
  assert.equal(core.itemScore(unscored), null);
  assert.equal(core.bucketOf(unscored), "obs");
});

test("number questions are observations, never scored", () => {
  const it = item({ type: "number", unit: "books", answer: "4" });
  assert.equal(core.itemScore(it), null);
  assert.equal(core.bucketOf(it), "obs");
});

test("a number below its size target is flagged to improve — and size decides it", () => {
  const passes = item({ type: "number", minBySize: { small: 2, medium: 4, large: 5 }, answer: "3" });
  assert.equal(core.bucketOf(passes, "small"), "obs");     // 3 ≥ 2
  assert.equal(core.bucketOf(passes, "medium"), "improve"); // 3 < 4
  assert.equal(core.bucketOf(passes, "large"), "improve");  // 3 < 5
  // No size given: nothing to compare against, so it stays an observation.
  assert.equal(core.bucketOf(passes), "obs");
  // Flagging never moves the numeric score.
  assert.equal(core.itemScore(passes), null);
});

test("bucket thresholds: ≥0.7 well, ≤0.5 improve, between is an observation", () => {
  const sc = (answer) => item({ type: "scale", min: 1, max: 5, answer });
  assert.equal(core.bucketOf(sc("5")), "well");    // 1.0
  assert.equal(core.bucketOf(sc("4")), "well");    // 0.75
  assert.equal(core.bucketOf(sc("3")), "improve"); // 0.5
  assert.equal(core.bucketOf(item({ answer: "pass" })), "well");
  assert.equal(core.bucketOf(item({ answer: "improve" })), "improve");
});

test("verdict bands", () => {
  assert.equal(core.verdictFor(100).word, "Good");
  assert.equal(core.verdictFor(85).word, "Good");
  assert.equal(core.verdictFor(84).word, "Satisfactory");
  assert.equal(core.verdictFor(65).word, "Satisfactory");
  assert.equal(core.verdictFor(64).word, "Needs attention");
});

test("scoreInspection averages only the scored items", () => {
  const sections = [
    { title: "S", items: [
      item({ answer: "pass" }),              // 1
      item({ answer: "fail" }),              // 0
      item({ type: "number", answer: "9" }), // not scored
      item({ answer: "na", allowNA: true }), // not scored
    ] },
  ];
  const r = core.scoreInspection(sections, "small");
  assert.equal(r.pct, 50);
  assert.equal(r.scored, 2);
  assert.equal(r.well, 1);
  assert.equal(r.poor, 1);
  assert.equal(r.obs, 1);
  assert.equal(r.unanswered, 0);
});

test("one failed critical item overrides the verdict, however high the score", () => {
  const passes = Array.from({ length: 19 }, () => item({ answer: "pass" }));
  const clean = core.scoreInspection([{ title: "S", items: passes }], "small");
  assert.equal(clean.pct, 100);
  assert.equal(clean.verdict.word, "Good");
  assert.deepEqual(clean.criticalFails, []);

  const withCrit = core.scoreInspection(
    [{ title: "S", items: passes.concat([item({ type: "yesno", critical: true, answer: "no", text: "Fire exits clear" })]) }],
    "small"
  );
  assert.equal(withCrit.pct, 95); // still a high percentage…
  assert.equal(withCrit.verdict.word, "Serious finding"); // …but it cannot be rated Good
  assert.deepEqual(withCrit.criticalFails, ["Fire exits clear"]);
});

test("a critical item flagged only by its size target still triggers the override", () => {
  const it = item({ type: "number", critical: true, minBySize: { small: 2, medium: 4, large: 5 }, answer: "3", text: "Toilet passes" });
  assert.equal(core.scoreInspection([{ title: "S", items: [it] }], "small").verdict.word, "Needs attention");
  assert.equal(core.scoreInspection([{ title: "S", items: [it] }], "large").verdict.word, "Serious finding");
});

test("only a clean pass-like answer may skip a note", () => {
  assert.equal(core.notesRequired(item({ answer: "pass" })), false);
  assert.equal(core.notesRequired(item({ answer: "improve" })), true);
  assert.equal(core.notesRequired(item({ type: "yesno", answer: "yes" })), false);
  assert.equal(core.notesRequired(item({ type: "yesno", answer: "no" })), true);
  // requireNote asks for one either way.
  assert.equal(core.notesRequired(item({ requireNote: true, answer: "pass" })), true);
  // N/A and unanswered never demand a note.
  assert.equal(core.notesRequired(item({ requireNote: true, allowNA: true, answer: "na" })), false);
  assert.equal(core.notesRequired(item({ requireNote: true, answer: null })), false);
  // A scored choice needs one only once it drops into "improve".
  const ch = (answer) => item({ type: "choice", scored: true, options: ["Yes", "Some disruption", "Too much disruption"], answer });
  assert.equal(core.notesRequired(ch("Yes")), false);
  assert.equal(core.notesRequired(ch("Too much disruption")), true);
});

test("critical fails need a photo unless the item is photo-exempt", () => {
  const blockedExit = item({ type: "yesno", critical: true, answer: "no" });
  assert.equal(core.criticalFail(blockedExit), true);
  assert.equal(core.photoRequired(blockedExit), true);

  // DBS records must never be photographed — written up instead.
  const dbs = item({ type: "yesno", critical: true, photoExempt: true, answer: "no" });
  assert.equal(core.criticalFail(dbs), true);
  assert.equal(core.photoRequired(dbs), false);
});

test("a passed critical item is not a critical fail", () => {
  const ok = item({ type: "yesno", critical: true, answer: "yes" });
  assert.equal(core.criticalFail(ok), false);
  assert.equal(core.photoRequired(ok), false);
});

test("guidance picks the line for the centre's size, or shows them all", () => {
  const it = item({
    guide: "Count the passes.",
    sizeGuide: { small: { text: "Small: 2." }, medium: { text: "Medium: 4–6." }, large: { text: "Large: 5+." } },
  });
  assert.equal(core.resolveGuide(it, "medium").text, "Medium: 4–6.\nCount the passes.");
  const all = core.resolveGuide(it).text;
  assert.ok(all.includes("Small: 2.") && all.includes("Large: 5+."));
  assert.deepEqual(core.resolveGuide(item({ dos: ["a"], donts: ["b"] })), { text: "", dos: ["a"], donts: ["b"] });
});

test("optionsFor offers N/A only where the question allows it", () => {
  assert.deepEqual(core.optionsFor(item({ type: "yesno" })), [["yes", "Yes"], ["no", "No"]]);
  assert.deepEqual(core.optionsFor(item({ type: "yesno", allowNA: true })).at(-1), ["na", "N/A"]);
  assert.equal(core.optionsFor(item({ type: "scale", min: 1, max: 5 })).length, 5);
  assert.equal(core.optionsFor(item({})).length, 3); // rating
});

test("answerText reads the way the report prints it", () => {
  assert.equal(core.answerText(item({ answer: "pass" })), "Pass");
  assert.equal(core.answerText(item({ type: "yesno", answer: "no" })), "No");
  assert.equal(core.answerText(item({ type: "scale", max: 5, answer: "4" })), "4 / 5");
  assert.equal(core.answerText(item({ type: "number", unit: "books", answer: "3" })), "3 books");
  assert.equal(core.answerText(item({ allowNA: true, answer: "na" })), "N/A");
  assert.equal(core.answerText(item({ answer: null })), "—");
});

test("fmtDuration renders accumulated active time", () => {
  assert.equal(core.fmtDuration(5400000), "1h 30m");
  assert.equal(core.fmtDuration(600000), "10m");
  assert.equal(core.fmtDuration(0), "0m");
  assert.equal(core.fmtDuration(-1), "0m");
});

/* ---------- the shipped checklist ---------- */

test("the seed is checklist v13: 15 sections, 101 questions, 23 centres", () => {
  const t = seed.config.template;
  assert.equal(seed.config.checklistVersion, 13);
  assert.equal(t.length, 15);
  assert.equal(t.reduce((n, s) => n + s.items.length, 0), 101);
  assert.equal(seed.config.centres.length, 23);
});

test("a blank inspection asks nothing of the inspector yet", () => {
  const sections = blankSections();
  const items = allItems(sections);
  assert.equal(items.length, 101);
  for (const it of items) {
    assert.ok(core.TYPE_LABELS[it.type || "rating"], `unknown type "${it.type}" on ${it.text}`);
    assert.equal(core.notesRequired(it, "small"), false, it.text);
    assert.equal(core.photoRequired(it, "small"), false, it.text);
    assert.equal(core.bucketOf(it, "small"), "skip", it.text);
  }
  const r = core.scoreInspection(sections, "small");
  assert.equal(r.pct, 0);
  assert.equal(r.unanswered, 101);
  assert.deepEqual(r.criticalFails, []);
});

test("every critical question demands a photo, or is exempt on purpose", () => {
  const criticals = allItems(blankSections()).filter((it) => it.critical);
  assert.equal(criticals.length, 8);
  // Safeguarding paperwork is written up, never photographed.
  assert.ok(criticals.some((it) => it.photoExempt && it.text.includes("DBS")));
  for (const it of criticals) {
    it.answer = it.type === "yesno" ? "no" : "fail";
    assert.equal(core.criticalFail(it, "small"), true, it.text);
    assert.equal(core.photoRequired(it, "small"), !it.photoExempt, it.text);
    assert.equal(core.notesRequired(it, "small"), true, it.text);
  }
});

test("a full pass sweep of the seeded checklist scores 100% and rates Good", () => {
  const sections = blankSections();
  for (const it of allItems(sections)) {
    const type = it.type || "rating";
    if (type === "yesno") it.answer = "yes";
    else if (type === "rating") it.answer = "pass";
    else if (type === "scale") it.answer = String(it.max || 5);
    else if (type === "choice") it.answer = (it.options || [])[0];
    else if (type === "number") it.answer = "99";
  }
  const r = core.scoreInspection(sections, "large");
  assert.equal(r.pct, 100);
  assert.equal(r.poor, 0);
  assert.deepEqual(r.criticalFails, []);
  assert.equal(r.verdict.word, "Good");
});

test("a walkout — everything answered badly — bottoms out at a serious finding", () => {
  const sections = blankSections();
  for (const it of allItems(sections)) {
    const type = it.type || "rating";
    if (type === "yesno") it.answer = "no";
    else if (type === "rating") it.answer = "fail";
    else if (type === "scale") it.answer = String(it.min || 1);
    else if (type === "choice") it.answer = (it.options || []).at(-1);
    else if (type === "number") it.answer = "0";
  }
  const r = core.scoreInspection(sections, "large");
  assert.equal(r.pct, 0);
  assert.equal(r.well, 0);
  assert.equal(r.criticalFails.length, 8);
  assert.equal(r.verdict.word, "Serious finding");
});
