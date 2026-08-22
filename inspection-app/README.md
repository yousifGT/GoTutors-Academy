# GoTutors Inspection App

Centre inspection tooling: an inspector walks a centre during a live session,
works through a 101-question checklist across 15 sections, records notes and
photo evidence against failures, and leaves with a scored report and a debrief.

Separate from the Academy LMS that fills the rest of this repository — it shares
the brand and the centre list, not the codebase.

```
inspection-app/
  core/       inspection-core.js — the scoring rules, shared by browser and server
  data/       gotutors-seed.json — checklist v13 + the 23 centres
  docs/       BACKEND-HANDOFF.md — the hosted-build spec (schema, API, AWS)
  prototype/  centre-inspection-app.html — the working single-file app
```

## Status

The **prototype is the product today**: one self-contained HTML file that runs
offline in a browser and keeps everything in local storage. It is also the
definitive spec for screens, ordering and branding — open it before changing any
flow.

```bash
open inspection-app/prototype/centre-inspection-app.html   # macOS
xdg-open inspection-app/prototype/centre-inspection-app.html
```

Management passcode in the seed is `Admin2026` — change it before any real use.

The hosted version described in `docs/BACKEND-HANDOFF.md` is **not built yet**.
Nothing here talks to a server.

## `core/inspection-core.js`

Every rule that decides a score, a report bucket, or whether a note or photo is
required. No dependencies, no DOM, no storage — the same module runs in the
browser and in Node, so the client and the server can't drift apart.

```js
import { computeScore, bucketOf, verdictFor } from "./core/inspection-core.js";

const { pct, well, poor, obs } = computeScore(sections, { size: "medium" });
verdictFor(pct); // { word: "Satisfactory", color: "#c07d10" }
```

The rules it owns:

| Rule | Behaviour |
|---|---|
| Scoring | rating pass/improve/fail → 1 / 0.5 / 0 · yes-no → 1 / 0 · scale normalised over its own min–max · scored choice ranked best-first. Numbers, N/A and unanswered don't count. |
| Buckets | ≥ 0.7 **well** · ≤ 0.5 **improve** · in between an **observation**. Numbers are observations unless they fall under their size target. |
| Verdict | ≥ 85% Good · ≥ 65% Satisfactory · below that Needs attention. |
| Notes | Only a clean pass-like answer may skip a note; `requireNote` questions always need one. |
| Photos | A failed **critical** item needs photo evidence — unless it is `photoExempt` (DBS records are written up, never photographed). |
| Guidance | Size-aware: shows the line for this centre's size, or all three when the size is unknown. |
| Active time | The clock runs only while the inspection is open and pauses when the inspector leaves it. |

**Centre size is not optional.** Number questions carrying `minBySize` — the
toilet-pass count today — resolve their bucket from it, so `bucketOf` and
`computeScore` take `{ size }`. Compute a bucket without it and the answer is
wrong. See `docs/BACKEND-HANDOFF.md` §2.

The prototype still carries its own inlined copy of these rules. Any change to a
rule has to land in both until the hosted front end replaces the file.

### Tests

```bash
node --test inspection-app/core/
```

22 tests, no dependencies and no config — deliberately outside the root Vitest
suite (`src/**/*.test.ts`), which is the LMS's. They cover each rule above and
assert the shipped checklist still matches: 15 sections, 101 questions, 23
centres, 8 critical items.

## Data

`data/gotutors-seed.json` is checklist **v13** in the app's own export shape:

```
{ config: { checklistVersion, configVersion, passcode, centres, template }, inspections: [] }
```

It loads straight into the prototype via Management → Data & Access → Import, and
seeds the hosted build's `templates` / `sections` / `questions` / `centres`
tables. No historical inspections are included.

## Next steps

The hosted build is specified in `docs/BACKEND-HANDOFF.md` and unstarted. In
rough order:

1. Postgres schema + seed importer from `gotutors-seed.json`.
2. Auth and the six roles, enforced at the data layer rather than in the UI.
3. Inspection API — drafts, autosave with `active_ms` checkpointing, submit.
4. Photo and signature upload to object storage, with signed URLs.
5. Report PDF, emailed and logged.
6. Cross-centre dashboard aggregations.

Before real data: a UK/EU region, a retention policy and a DPIA — inspection
photos are taken in a children's setting.
