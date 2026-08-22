/**
 * GoTutors inspection core — checklist v13.
 *
 * Every rule that decides a score, a report bucket, or whether a note or photo is
 * required lives here, so the browser and the server can never drift apart.
 * No dependencies, no DOM, no storage: pure functions over plain objects.
 *
 * Ported from the single-file prototype (prototype/centre-inspection-app.html),
 * which remains the reference for screens, ordering and branding.
 *
 * The one behavioural difference from the prototype: centre size is passed in
 * rather than read from a module-level `state`. Number questions carrying
 * `minBySize` resolve their bucket from it, so a bucket computed without a size
 * is wrong — see BACKEND-HANDOFF.md §2.
 *
 * A question ("item") is the shape stored in the template:
 *   { text, type, options, min, max, unit, tally, scored, requireNote, critical,
 *     photoExempt, allowNA, whoField, guide, dos, donts, sizeGuide, minBySize,
 *     answer, entries: [{ note, who, photos: [] }] }
 */

/** Question types, and how they read in the checklist editor. */
export const TYPE_LABELS = {
  rating: "Pass / Improve / Fail",
  yesno: "Yes / No",
  scale: "Scale (1–max)",
  number: "Number",
  choice: "Multiple choice",
};

export const SIZES = ["small", "medium", "large"];

/** Build a template question. Mirrors the prototype's `q()` helper. */
export function q(text, type, extra) {
  return Object.assign({ text, type: type || "rating" }, extra || {});
}

export function sizeLabel(size) {
  return { small: "Small (≤ 50)", medium: "Medium (50–150)", large: "Large (150+)" }[size] || "";
}

/** The tappable options for a question. `number` is entered, not tapped. */
export function optionsFor(item) {
  const na = item.allowNA ? [["na", "N/A"]] : [];
  if (item.type === "yesno") return [["yes", "Yes"], ["no", "No"]].concat(na);
  if (item.type === "scale") {
    const max = item.max || 5, min = item.min || 1, o = [];
    for (let n = min; n <= max; n++) o.push([String(n), String(n)]);
    return o.concat(na);
  }
  if (item.type === "choice") return (item.options || []).map((x) => [x, x]).concat(na);
  return [["pass", "Pass"], ["improve", "Improve"], ["fail", "Fail"]].concat(na); // rating
}

function answerOf(item, answer) {
  return answer === undefined ? item.answer : answer;
}

/**
 * Score fraction 0..1, or null when the item doesn't count toward the score
 * (unanswered, N/A, a number reading, or an unscored multiple choice).
 */
export function itemScore(item, answer) {
  const a = answerOf(item, answer);
  if (a === null || a === undefined || a === "" || a === "na") return null;
  if (item.type === "yesno") return a === "yes" ? 1 : 0;
  if (item.type === "scale") {
    const min = item.min || 1, max = item.max || 5, n = Number(a);
    return isNaN(n) ? null : (n - min) / (max - min);
  }
  if (item.type === "choice") {
    // A scored choice ranks best-first: the first option is 1, the last is 0.
    if (item.scored && item.options && item.options.length) {
      const i = item.options.indexOf(a);
      if (i >= 0) {
        const last = item.options.length - 1;
        return last > 0 ? (last - i) / last : 1;
      }
    }
    return null;
  }
  if (item.type === "number") return null; // recorded as an observation, not scored
  return a === "pass" ? 1 : a === "improve" ? 0.5 : 0; // rating
}

/**
 * Which part of the report an item lands in:
 * "well" | "improve" | "obs" | "skip".
 *
 * @param {object} opts - { size } — required for number questions with `minBySize`.
 */
export function bucketOf(item, opts) {
  const size = (opts && opts.size) || "";
  const a = answerOf(item, opts && opts.answer);
  if (a === null || a === undefined || a === "" || a === "na") return "skip";
  if (item.type === "number") {
    if (item.minBySize) {
      const min = size && item.minBySize[size];
      const n = Number(a);
      if (min != null && !isNaN(n) && n < min) return "improve";
    }
    return "obs";
  }
  if (item.type === "choice" && !(item.scored && item.options)) return "obs";
  const f = itemScore(item, a);
  if (f === null) return "skip";
  if (f >= 0.7) return "well";
  if (f <= 0.5) return "improve";
  return "obs"; // a middling scale value
}

/** Human-readable answer for the report and the CSV. */
export function answerText(item, answer) {
  const a = answerOf(item, answer);
  if (a === null || a === undefined || a === "") return "—";
  if (a === "na") return "N/A";
  if (item.type === "scale") return a + " / " + (item.max || 5);
  if (item.type === "number") return a + (item.unit ? " " + item.unit : "");
  if (item.type === "yesno") return a === "yes" ? "Yes" : "No";
  if (item.type === "rating") return a.charAt(0).toUpperCase() + a.slice(1);
  return a;
}

/**
 * Roll a whole inspection up into a headline percentage and the report counts.
 *
 * @param {Array} sections - [{ title, items: [...] }]
 * @param {object} opts    - { size }
 */
export function computeScore(sections, opts) {
  let scored = 0, pts = 0, well = 0, poor = 0, obs = 0, unanswered = 0;
  (sections || []).forEach((s) =>
    (s.items || []).forEach((it) => {
      const f = itemScore(it);
      const b = bucketOf(it, opts);
      if (it.answer === null || it.answer === undefined || it.answer === "") unanswered++;
      if (f !== null) { scored++; pts += f; }
      if (b === "well") well++;
      else if (b === "improve") poor++;
      else if (b === "obs") obs++;
    })
  );
  const pct = scored ? Math.round((pts / scored) * 100) : 0;
  return { pct, scored, well, poor, obs, unanswered };
}

export function verdictFor(pct) {
  if (pct >= 85) return { word: "Good", color: "#2f855a" };
  if (pct >= 65) return { word: "Satisfactory", color: "#c07d10" };
  return { word: "Needs attention", color: "#c0392b" };
}

/* ---------- note & photo rules ---------- */

/**
 * Only a clean "pass-like" answer may skip a note; anything short of that has to
 * be explained. Questions marked `requireNote` always need one, good or bad.
 */
export function notesRequired(item, opts) {
  const a = answerOf(item, opts && opts.answer);
  if (a === null || a === undefined || a === "" || a === "na") return false;
  if (item.requireNote) return true;
  if (item.type === "rating") return a !== "pass";
  if (item.type === "yesno") return a !== "yes";
  if (item.type === "scale") return bucketOf(item, opts) === "improve";
  if (item.type === "choice" && item.scored) return bucketOf(item, opts) === "improve";
  return false; // number / unscored choice: optional
}

export function noteMissing(item, opts) {
  return notesRequired(item, opts) && !(item.entries || []).some((e) => e.note && e.note.trim());
}

/** A critical item flagged to-improve at this visit. */
export function criticalFail(item, opts) {
  return !!item.critical && bucketOf(item, opts) === "improve";
}

/**
 * Critical fails carry a photo as evidence — except the photo-exempt ones,
 * which are written up instead (DBS records must never be photographed).
 */
export function photoRequired(item, opts) {
  return criticalFail(item, opts) && !item.photoExempt;
}

export function photoMissing(item, opts) {
  return photoRequired(item, opts) && !(item.entries || []).some((e) => e.photos && e.photos.length);
}

/** Was this question flagged to-improve at the previous visit to this centre? */
export function repeatIssue(item, prev, opts) {
  return !!(prev && prev.flagged && prev.flagged.includes(item.text)) && bucketOf(item, opts) === "improve";
}

/* ---------- guidance ---------- */

/**
 * Resolve a question's guidance for the inspector: the size-specific line when a
 * size is known, otherwise every size's line so nothing is hidden, then the
 * question's own guide, then the do / don't lists.
 */
export function resolveGuide(item, opts) {
  const size = (opts && opts.size) || "";
  let text = item.guide || "";
  if (item.sizeGuide) {
    const chosen = size && item.sizeGuide[size] && item.sizeGuide[size].text;
    if (chosen) {
      text = chosen + (item.guide ? "\n" + item.guide : "");
    } else {
      const all = SIZES.map((k) => item.sizeGuide[k] && item.sizeGuide[k].text).filter(Boolean);
      if (all.length) text = all.join("\n") + (item.guide ? "\n" + item.guide : "");
    }
  }
  return { text, dos: item.dos || [], donts: item.donts || [] };
}

/* ---------- template → answerable state ---------- */

/** Give an item the fields the inspection screen expects, without losing answers. */
export function normalizeItem(item) {
  if (!item.entries || !item.entries.length) {
    item.entries = [{ note: item.note || "", who: item.who || "", photos: item.photos || [] }];
  }
  item.entries.forEach((e) => {
    if (!e.photos) e.photos = [];
    if (e.note == null) e.note = "";
  });
  if (item.answer === undefined) item.answer = null;
  return item;
}

/** Turn a template ({ title, items }[]) into a blank, answerable inspection. */
export function sectionsFromTemplate(template) {
  return (template || []).map((s, si) => ({
    title: s.title,
    items: (s.items || []).map((it, ii) =>
      normalizeItem(
        Object.assign({}, it, {
          id: si + "-" + ii,
          type: it.type || "rating",
          answer: null,
          entries: [{ note: "", who: "", photos: [] }],
        })
      )
    ),
  }));
}

/* ---------- active time ---------- */

/**
 * Accumulated active milliseconds. The clock only runs while the inspection is
 * open — `segStart` is the current running segment, null while paused.
 * Legacy records with no `activeMs` fall back to wall-clock start→end.
 */
export function activeDurationMs(meta, now) {
  if (!meta) return 0;
  const t = now == null ? Date.now() : now;
  if (meta.activeMs == null && meta.start && meta.end) {
    return Math.max(0, new Date(meta.end) - new Date(meta.start));
  }
  let ms = meta.activeMs || 0;
  if (meta.segStart) ms += t - meta.segStart;
  return ms;
}

export function fmtDur(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60), mm = mins % 60;
  return h ? h + "h " + mm + "m" : mm + "m";
}

/** Every question in an inspection, flattened — handy for exports and totals. */
export function eachItem(sections) {
  const out = [];
  (sections || []).forEach((s) => (s.items || []).forEach((it) => out.push({ section: s.title, item: it })));
  return out;
}

/** The questions that must be resolved before an inspection can be submitted. */
export function inspectionGaps(sections, opts) {
  const missingNotes = [], missingPhotos = [], unansweredCritical = [];
  eachItem(sections).forEach(({ item }) => {
    if (noteMissing(item, opts)) missingNotes.push(item.text);
    if (photoMissing(item, opts)) missingPhotos.push(item.text);
    if (item.critical && (item.answer === null || item.answer === undefined || item.answer === "")) {
      unansweredCritical.push(item.text);
    }
  });
  return { missingNotes, missingPhotos, unansweredCritical };
}
