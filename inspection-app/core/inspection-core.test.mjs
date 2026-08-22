/**
 * node --test inspection-app/core/
 *
 * These lock the rules that decide a centre's score, so a refactor can't quietly
 * move a pass mark or drop a photo requirement.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as core from "./inspection-core.js";

const seed = JSON.parse(
  readFileSync(fileURLToPath(new URL("../data/gotutors-seed.json", import.meta.url)), "utf8")
);

const item = (extra) => core.normalizeItem(Object.assign({ text: "t", type: "rating" }, extra));

test("rating scores pass 1, improve 0.5, fail 0", () => {
  assert.equal(core.itemScore(item({ answer: "pass" })), 1);
  assert.equal(core.itemScore(item({ answer: "improve" })), 0.5);
  assert.equal(core.itemScore(item({ answer: "fail" })), 0);
});

test("unanswered and N/A are excluded from the score", () => {
  assert.equal(core.itemScore(item({ answer: null })), null);
  assert.equal(core.itemScore(item({ answer: "" })), null);
  assert.equal(core.itemScore(item({ answer: "na", allowNA: true })), null);
  assert.equal(core.bucketOf(item({ answer: "na", allowNA: true })), "skip");
});

test("a scale normalises across its own min and max", () => {
  const it = item({ type: "scale", min: 1, max: 5 });
  assert.equal(core.itemScore(it, "1"), 0);
  assert.equal(core.itemScore(it, "3"), 0.5);
  assert.equal(core.itemScore(it, "5"), 1);
});

test("a scored choice ranks best-first; an unscored one is an observation", () => {
  const scored = item({ type: "choice", scored: true, options: ["Yes", "Some disruption", "Too much disruption"] });
  assert.equal(core.itemScore(scored, "Yes"), 1);
  assert.equal(core.itemScore(scored, "Some disruption"), 0.5);
  assert.equal(core.itemScore(scored, "Too much disruption"), 0);

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
  assert.equal(core.bucketOf(passes, { size: "small" }), "obs");    // 3 ≥ 2
  assert.equal(core.bucketOf(passes, { size: "medium" }), "improve"); // 3 < 4
  assert.equal(core.bucketOf(passes, { size: "large" }), "improve");  // 3 < 5
  // No size given: nothing to compare against, so it stays an observation.
  assert.equal(core.bucketOf(passes), "obs");
});

test("bucket thresholds: ≥0.7 well, ≤0.5 improve, between is an observation", () => {
  const sc = item({ type: "scale", min: 1, max: 5 });
  assert.equal(core.bucketOf(sc, { answer: "5" }), "well");   // 1.0
  assert.equal(core.bucketOf(sc, { answer: "4" }), "well");   // 0.75
  assert.equal(core.bucketOf(sc, { answer: "3" }), "improve"); // 0.5
  assert.equal(core.bucketOf(item({ answer: "improve" })), "improve");
  assert.equal(core.bucketOf(item({ answer: "pass" })), "well");
});

test("verdict bands", () => {
  assert.equal(core.verdictFor(100).word, "Good");
  assert.equal(core.verdictFor(85).word, "Good");
  assert.equal(core.verdictFor(84).word, "Satisfactory");
  assert.equal(core.verdictFor(65).word, "Satisfactory");
  assert.equal(core.verdictFor(64).word, "Needs attention");
});

test("computeScore averages only the scored items", () => {
  const sections = [
    { title: "S", items: [
      item({ answer: "pass" }),                         // 1
      item({ answer: "fail" }),                         // 0
      item({ type: "number", answer: "9" }),            // not scored
      item({ answer: "na", allowNA: true }),            // not scored
    ] },
  ];
  const r = core.computeScore(sections, { size: "small" });
  assert.equal(r.pct, 50);
  assert.equal(r.scored, 2);
  assert.equal(r.well, 1);
  assert.equal(r.poor, 1);
  assert.equal(r.obs, 1);
  assert.equal(r.unanswered, 0);
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
});

test("a note on any entry satisfies the requirement", () => {
  const it = item({ answer: "fail" });
  assert.equal(core.noteMissing(it), true);
  it.entries = [{ note: "   ", photos: [] }, { note: "Tutor spoken to", who: "Sara", photos: [] }];
  assert.equal(core.noteMissing(it), false);
});

test("critical fails need a photo unless the item is photo-exempt", () => {
  const blockedExit = item({ type: "yesno", critical: true, answer: "no" });
  assert.equal(core.criticalFail(blockedExit), true);
  assert.equal(core.photoRequired(blockedExit), true);
  assert.equal(core.photoMissing(blockedExit), true);
  blockedExit.entries = [{ note: "Boxes across the rear exit", photos: ["s3://x.jpg"] }];
  assert.equal(core.photoMissing(blockedExit), false);

  // DBS records must never be photographed — written up instead.
  const dbs = item({ type: "yesno", critical: true, photoExempt: true, answer: "no" });
  assert.equal(core.criticalFail(dbs), true);
  assert.equal(core.photoRequired(dbs), false);
  assert.equal(core.photoMissing(dbs), false);
});

test("a passed critical item is not a critical fail", () => {
  assert.equal(core.criticalFail(item({ type: "yesno", critical: true, answer: "yes" })), false);
});

test("repeat issues only count when the item is flagged again", () => {
  const prev = { flagged: ["t"] };
  assert.equal(core.repeatIssue(item({ answer: "fail" }), prev), true);
  assert.equal(core.repeatIssue(item({ answer: "pass" }), prev), false);
  assert.equal(core.repeatIssue(item({ answer: "fail" }), null), false);
});

test("guidance picks the line for the centre's size, or shows them all", () => {
  const it = item({
    guide: "Count the passes.",
    sizeGuide: { small: { text: "Small: 2." }, medium: { text: "Medium: 4–6." }, large: { text: "Large: 5+." } },
  });
  assert.equal(core.resolveGuide(it, { size: "medium" }).text, "Medium: 4–6.\nCount the passes.");
  const all = core.resolveGuide(it).text;
  assert.ok(all.includes("Small: 2.") && all.includes("Large: 5+."));
});

test("answerText reads the way the report prints it", () => {
  assert.equal(core.answerText(item({ answer: "pass" })), "Pass");
  assert.equal(core.answerText(item({ type: "yesno", answer: "no" })), "No");
  assert.equal(core.answerText(item({ type: "scale", max: 5, answer: "4" })), "4 / 5");
  assert.equal(core.answerText(item({ type: "number", unit: "books", answer: "3" })), "3 books");
  assert.equal(core.answerText(item({ allowNA: true, answer: "na" })), "N/A");
  assert.equal(core.answerText(item({ answer: null })), "—");
});

test("active time excludes the paused stretches", () => {
  assert.equal(core.activeDurationMs({ activeMs: 600000, segStart: null }), 600000);
  assert.equal(core.activeDurationMs({ activeMs: 600000, segStart: 1000 }, 61000), 660000);
  // Legacy record with no activeMs falls back to wall clock.
  assert.equal(
    core.activeDurationMs({ start: "2026-08-01T10:00:00Z", end: "2026-08-01T12:00:00Z" }),
    7200000
  );
  assert.equal(core.fmtDur(5400000), "1h 30m");
  assert.equal(core.fmtDur(600000), "10m");
});

test("inspectionGaps lists what still blocks submission", () => {
  const sections = [
    { title: "S", items: [
      item({ answer: "fail" }),                                            // note missing
      item({ type: "yesno", critical: true, answer: "no", text: "Fire exits clear" }), // note + photo missing
      item({ type: "yesno", critical: true, answer: null, text: "Ratios" }),           // unanswered critical
    ] },
  ];
  const gaps = core.inspectionGaps(sections, { size: "small" });
  assert.equal(gaps.missingNotes.length, 2);
  assert.deepEqual(gaps.missingPhotos, ["Fire exits clear"]);
  assert.deepEqual(gaps.unansweredCritical, ["Ratios"]);
});

/* ---------- the shipped checklist ---------- */

test("the seed is checklist v13: 15 sections, 101 questions", () => {
  const t = seed.config.template;
  assert.equal(seed.config.checklistVersion, 13);
  assert.equal(t.length, 15);
  assert.equal(t.reduce((n, s) => n + s.items.length, 0), 101);
  assert.equal(seed.config.centres.length, 23);
});

test("every seeded question builds a blank, answerable item", () => {
  const sections = core.sectionsFromTemplate(seed.config.template);
  const items = core.eachItem(sections);
  assert.equal(items.length, 101);
  for (const { item: it } of items) {
    assert.equal(it.answer, null, it.text);
    assert.equal(it.entries.length, 1, it.text);
    assert.ok(core.TYPE_LABELS[it.type], `unknown type "${it.type}" on ${it.text}`);
    // A blank inspection asks nothing of the inspector yet.
    assert.equal(core.notesRequired(it), false, it.text);
    assert.equal(core.photoRequired(it), false, it.text);
  }
  assert.equal(core.computeScore(sections, { size: "small" }).pct, 0);
  assert.equal(core.computeScore(sections, { size: "small" }).unanswered, 101);
});

test("every critical question is answerable without a photo, or demands one", () => {
  const items = core.eachItem(core.sectionsFromTemplate(seed.config.template))
    .map((x) => x.item)
    .filter((it) => it.critical);
  assert.equal(items.length, 8);
  const exempt = items.filter((it) => it.photoExempt).map((it) => it.text);
  // Safeguarding paperwork is written up, never photographed.
  assert.ok(exempt.some((t) => t.includes("DBS")));
  for (const it of items) {
    it.answer = it.type === "yesno" ? "no" : "fail";
    assert.equal(core.criticalFail(it), true, it.text);
    assert.equal(core.photoRequired(it), !it.photoExempt, it.text);
  }
});

test("a full pass sweep of the seeded checklist scores 100%", () => {
  const sections = core.sectionsFromTemplate(seed.config.template);
  for (const { item: it } of core.eachItem(sections)) {
    if (it.type === "yesno") it.answer = "yes";
    else if (it.type === "rating") it.answer = "pass";
    else if (it.type === "scale") it.answer = String(it.max || 5);
    else if (it.type === "choice") it.answer = (it.options || [])[0];
    else if (it.type === "number") it.answer = "99";
    it.entries = [{ note: "Checked.", who: "", photos: [] }];
  }
  const r = core.computeScore(sections, { size: "large" });
  assert.equal(r.pct, 100);
  assert.equal(r.poor, 0);
  assert.equal(core.verdictFor(r.pct).word, "Good");
  const gaps = core.inspectionGaps(sections, { size: "large" });
  assert.deepEqual(gaps.missingPhotos, []);
  assert.deepEqual(gaps.unansweredCritical, []);
});
