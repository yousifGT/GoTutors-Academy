/*
 * GoTutors Inspection — Core Logic (framework-agnostic)  v13
 * ----------------------------------------------------------------------------
 * The *rules* of the inspection, with NO user-interface or storage code. This is
 * the part of the prototype that transfers directly to the hosted AWS backend or
 * a new front end. Import it in Node (backend) and/or the browser (frontend) so
 * scoring, bucketing, critical-override, note/photo requirements and the new
 * size-based flagging behave identically everywhere — one source of truth.
 *
 * The checklist CONTENT is not hard-coded here — it ships as seed data
 * (gotutors-seed.json, same shape as the app's "Export backup"). Import the
 * `config` object from that file as your template/centres/passcode seed.
 *
 * ── WHAT CHANGED SINCE THE FIRST HANDOFF ─────────────────────────────────────
 *  • Centre size (small | medium | large) is captured per inspection and drives
 *    two things: size-specific guideline text, and a size-based minimum on
 *    number questions (currently the toilet-pass count).
 *  • Number questions may carry `minBySize`: if the recorded count is below the
 *    target for the inspection's size, the item is flagged "improve" (it does not
 *    change the numeric %, it just surfaces as an improvement point).
 *  • Critical items may be `photoExempt` (procedural / verbal / data-sensitive
 *    checks such as DBS — a written note is required instead of a photo).
 *  • `whoField` questions attach a tutor name to each note entry (the three
 *    Teaching Observation sections use this on every question).
 *  • Active time: an inspection stores accumulated active milliseconds
 *    (`activeMs`) rather than a raw start→end wall clock, because the timer
 *    pauses whenever the inspector leaves the inspection.
 *
 * ── DATA SHAPES ──────────────────────────────────────────────────────────────
 * Question (template):
 *   { text, type, options?, min?, max?, unit?, scored?, requireNote?,
 *     critical?, photoExempt?, allowNA?, guide?, dos?[], donts?[],
 *     sizeGuide?{small|medium|large:{text}}, minBySize?{small|medium|large:number},
 *     whoField?, tally? }
 *   type ∈ "rating" | "yesno" | "scale" | "number" | "choice"
 *
 * Answered item (an inspection):
 *   Question fields + { answer, entries:[{ note, who?, photos:[url] }] }
 *   answer values: rating→"pass"|"improve"|"fail"|"na"
 *                  yesno →"yes"|"no"|"na"
 *                  scale →"1".."max" | "na"
 *                  number→numeric string
 *                  choice→one of options | "na"
 *                  (null / "" means unanswered)
 *
 * Inspection meta: { centre, inspector, size, date, start, end, activeMs, segStart }
 *   size ∈ "small" (≤50) | "medium" (50–150) | "large" (150+) | "" (unset)
 * ────────────────────────────────────────────────────────────────────────────
 */

function q(text, type, extra) { return Object.assign({ text: text, type: type || "rating" }, extra || {}); }

var TYPE_LABELS = {
  rating: "Pass / Improve / Fail",
  yesno:  "Yes / No",
  scale:  "Scale (1–max)",
  number: "Number",
  choice: "Multiple choice"
};

// Selectable options for a question (number is a free input, not options).
function optionsFor(it) {
  var na = it.allowNA ? [["na", "N/A"]] : [];
  if (it.type === "yesno") return [["yes", "Yes"], ["no", "No"]].concat(na);
  if (it.type === "scale") {
    var max = it.max || 5, min = it.min || 1, o = [];
    for (var n = min; n <= max; n++) o.push([String(n), String(n)]);
    return o.concat(na);
  }
  if (it.type === "choice") return (it.options || []).map(function (x) { return [x, x]; }).concat(na);
  return [["pass", "Pass"], ["improve", "Improve"], ["fail", "Fail"]].concat(na);
}

// Score fraction 0..1, or null if the item does not count toward the % score
// (unanswered, N/A, free numbers, unscored multiple-choice).
function itemScore(it) {
  var a = it.answer;
  if (a === null || a === "" || a === "na" || a === undefined) return null;
  if (it.type === "yesno") return a === "yes" ? 1 : 0;
  if (it.type === "scale") {
    var min = it.min || 1, max = it.max || 5, n = Number(a);
    return isNaN(n) ? null : (n - min) / (max - min);
  }
  if (it.type === "choice") {
    if (it.scored && it.options && it.options.length) {
      var i = it.options.indexOf(a);
      if (i >= 0) { var last = it.options.length - 1; return last > 0 ? (last - i) / last : 1; }
    }
    return null;
  }
  if (it.type === "number") return null; // numbers are observations, not scored
  return a === "pass" ? 1 : (a === "improve" ? 0.5 : 0);
}

// Which report section an answered item belongs to.
// `size` is the inspection's centre size ("small"|"medium"|"large"|"") and is
// only needed for number questions that carry a minBySize target.
function bucketOf(it, size) {
  var a = it.answer;
  if (a === null || a === "" || a === "na" || a === undefined) return "skip";
  if (it.type === "number") {
    if (it.minBySize && size && it.minBySize[size] != null) {
      var n = Number(a);
      if (!isNaN(n) && n < it.minBySize[size]) return "improve"; // below the size target → flag
    }
    return "obs";
  }
  if (it.type === "choice" && !(it.scored && it.options)) return "obs";
  var f = itemScore(it);
  if (f === null) return "skip";
  if (f >= 0.7) return "well";
  if (f <= 0.5) return "improve";
  return "obs";
}

// A clean "pass-like" answer may skip a note; everything else must carry one.
function notesRequired(it, size) {
  var a = it.answer;
  if (a === null || a === "" || a === "na" || a === undefined) return false;
  if (it.requireNote) return true;
  if (it.type === "rating") return a !== "pass";
  if (it.type === "yesno")  return a !== "yes";
  if (it.type === "scale")  return bucketOf(it, size) === "improve";
  if (it.type === "choice" && it.scored) return bucketOf(it, size) === "improve";
  return false;
}

// A failed critical item — caps the whole inspection at "Serious finding".
function criticalFail(it, size) { return !!it.critical && bucketOf(it, size) === "improve"; }

// Critical fails need a photo as evidence, UNLESS the question is photoExempt
// (procedural / verbal / data-sensitive — a written note is required instead).
function photoRequired(it, size) { return criticalFail(it, size) && !it.photoExempt; }

// Overall verdict from a percentage (before any critical override).
function verdictFor(pct) {
  if (pct >= 85) return { word: "Good", color: "#2f855a" };
  if (pct >= 65) return { word: "Satisfactory", color: "#c07d10" };
  return { word: "Needs attention", color: "#c0392b" };
}

// Human-readable answer, e.g. for reports / CSV.
function answerText(it) {
  var a = it.answer;
  if (a === null || a === "" || a === undefined) return "—";
  if (a === "na") return "N/A";
  if (it.type === "scale")  return a + " / " + (it.max || 5);
  if (it.type === "number") return a + (it.unit ? (" " + it.unit) : "");
  if (it.type === "yesno")  return a === "yes" ? "Yes" : "No";
  if (it.type === "rating") return a.charAt(0).toUpperCase() + a.slice(1);
  return a;
}

// Resolve a question's Guidelines: size-aware text + do / don't lists.
// Returns { text, dos:[], donts:[] }.
function resolveGuide(it, size) {
  var text = it.guide || "";
  if (it.sizeGuide) {
    var chosen = size && it.sizeGuide[size] && it.sizeGuide[size].text;
    if (chosen) { text = chosen + (it.guide ? ("\n" + it.guide) : ""); }
    else {
      var all = ["small", "medium", "large"]
        .map(function (k) { return it.sizeGuide[k] && it.sizeGuide[k].text; })
        .filter(Boolean);
      if (all.length) text = all.join("\n") + (it.guide ? ("\n" + it.guide) : "");
    }
  }
  return { text: text, dos: it.dos || [], donts: it.donts || [] };
}

// Score a whole inspection. sections: [{ title, items:[answeredItem] }], plus the
// inspection's centre size. Returns { pct, scored, well, poor, obs, unanswered,
// criticalFails:[text], verdict }.
function scoreInspection(sections, size) {
  var scored = 0, pts = 0, well = 0, poor = 0, obs = 0, unanswered = 0, crit = [];
  (sections || []).forEach(function (s) {
    (s.items || []).forEach(function (it) {
      var f = itemScore(it), b = bucketOf(it, size);
      if (it.answer === null || it.answer === "" || it.answer === undefined) unanswered++;
      if (f !== null) { scored++; pts += f; }
      if (b === "well") well++; else if (b === "improve") poor++; else if (b === "obs") obs++;
      if (criticalFail(it, size)) crit.push(it.text);
    });
  });
  var pct = scored ? Math.round((pts / scored) * 100) : 0;
  var verdict = crit.length ? { word: "Serious finding", color: "#c0392b" } : verdictFor(pct);
  return { pct: pct, scored: scored, well: well, poor: poor, obs: obs, unanswered: unanswered, criticalFails: crit, verdict: verdict };
}

// Format accumulated active milliseconds as "Xh Ym" / "Ym".
function fmtDuration(ms) {
  var mins = Math.max(0, Math.round(ms / 60000)), h = Math.floor(mins / 60), mm = mins % 60;
  return h ? (h + "h " + mm + "m") : (mm + "m");
}

var CORE = {
  q: q, TYPE_LABELS: TYPE_LABELS, optionsFor: optionsFor, itemScore: itemScore,
  bucketOf: bucketOf, notesRequired: notesRequired, criticalFail: criticalFail,
  photoRequired: photoRequired, verdictFor: verdictFor, answerText: answerText,
  resolveGuide: resolveGuide, scoreInspection: scoreInspection, fmtDuration: fmtDuration
};
if (typeof module !== "undefined" && module.exports) module.exports = CORE;
if (typeof window !== "undefined") window.InspectionCore = CORE;
