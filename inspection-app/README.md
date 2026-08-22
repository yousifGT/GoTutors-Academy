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

The hosted build has started: the database schema, the seed importer and the
scoring bridge are in (`prisma/schema.prisma`, `prisma/seed-inspection.ts`,
`src/lib/inspection/`). There is no API or UI yet, so the **prototype is still
the product today**: one self-contained HTML file that runs
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

Every rule that decides a score, a report bucket, a verdict, or whether a note or
photo is required. No dependencies, no DOM, no storage — the same file runs in
Node (`require`) and in the browser (`window.InspectionCore`), so the client and
the server can't drift apart. Ships as-is from the handoff; treat it as the one
source of truth and change it deliberately.

```js
const core = require("./core/inspection-core.js");

const r = core.scoreInspection(sections, "medium");
// { pct, scored, well, poor, obs, unanswered, criticalFails: [text], verdict }
```

The rules it owns:

| Rule | Behaviour |
|---|---|
| Scoring | rating pass/improve/fail → 1 / 0.5 / 0 · yes-no → 1 / 0 · scale normalised over its own min–max · scored choice ranked best-first. Numbers, N/A and unanswered don't count. |
| Buckets | ≥ 0.7 **well** · ≤ 0.5 **improve** · in between an **observation**. Numbers are observations unless they fall under their size target. |
| Verdict | ≥ 85% Good · ≥ 65% Satisfactory · below that Needs attention. |
| **Critical override** | **Any failed critical item makes the verdict "Serious finding", however high the percentage. A centre with one blocked fire exit cannot be rated Good.** |
| Notes | Only a clean pass-like answer may skip a note; `requireNote` questions always need one. |
| Photos | A failed **critical** item needs photo evidence — unless it is `photoExempt` (DBS records are written up, never photographed). |
| Guidance | Size-aware: shows the line for this centre's size, or all three when the size is unknown. |
| Duration | `fmtDuration(activeMs)` — the stored clock is accumulated *active* time, not start→end. |

**Centre size is not optional.** `bucketOf`, `notesRequired`, `criticalFail`,
`photoRequired`, `resolveGuide` and `scoreInspection` all take it as their second
argument. Number questions carrying `minBySize` — the toilet-pass count today —
resolve their bucket from it, so a bucket computed without a size is wrong, and a
critical number question can flip the whole verdict on size alone. See
`docs/BACKEND-HANDOFF.md` §2.

What it deliberately leaves to the caller: whether a required note or photo has
actually been supplied (`notesRequired` / `photoRequired` say what is *needed*;
the entries live on the item), repeat-issue detection against the previous visit,
and turning a template into a blank answerable inspection. The prototype does all
three; a hosted front end will need its own.

The prototype still carries its own inlined copy of these rules. Any change to a
rule has to land in both until the hosted front end replaces the file.

### Tests

```bash
node --test inspection-app/core/
```

23 tests, no dependencies and no config — deliberately outside the root Vitest
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

## The hosted build

It is being built into this repository rather than as the separate AWS stack the
handoff sketches, because the Academy already provides most of what that stack
would stand up: Postgres via Prisma, NextAuth, a Centre and User model, roles
with per-user permission overrides, and an upload path that already supports S3.
The handoff's schema and API surface still hold — read `docs/BACKEND-HANDOFF.md`
for the intent, and the notes below for where this repo diverges.

| Handoff | Here |
|---|---|
| `profiles` + Cognito | the existing `User` / `Role`, plus four `inspection.*` permissions |
| `centres` | the existing `Centre`, with a new nullable `size` |
| `templates` / `sections` / `questions` | `InspectionTemplate` / `InspectionSection` / `InspectionQuestion` |
| `inspections` / `answers` / `answer_entries` / `entry_photos` | `Inspection` / `InspectionAnswer` / `InspectionEntry` / `InspectionPhoto` |
| RLS at the data layer | `userHasPermission` + centre scoping in the route handlers |
| S3 signed URLs | `src/lib/storage.ts` (`UPLOAD_BACKEND=s3`) |

Seed the checklist and the 23 centres into the database:

```bash
npm run db:push
npm run db:seed:inspection     # idempotent; safe against a live database
```

Existing centres are matched by name and never overwritten. Re-importing the
same `checklistVersion` updates that template in place; a new version publishes a
new template beside it and marks the old one inactive, so inspections already
recorded stay readable against the checklist they were run under.

`src/lib/inspection/score.ts` is the bridge between database rows and the rules.
It takes centre size as a **required** argument everywhere, which is what stops a
bucket being computed without one.

### API

| Route | What it does |
|---|---|
| `GET /api/inspections/template` | the live checklist, in inspector order |
| `GET /api/inspections` | list, scoped to what the viewer may see (`?centre=&from=&to=&limit=`) |
| `POST /api/inspections` | start a visit; returns the existing draft if one is already open for that inspector, centre and day |
| `GET /api/inspections/:id` | one inspection with its checklist, answers and live score |
| `PATCH /api/inspections/:id` | autosave — answers, notes, photos, `activeMs`, debrief |
| `POST /api/inspections/:id/submit` | close it: score on the server, write the buckets, lock it |
| `DELETE /api/inspections/:id` | discard a draft |

Rules the API enforces, not just the UI:

- The **score is computed server-side** from the stored answers and never taken
  from the request.
- **Submission is refused** (422, listing what is outstanding) while any question
  is unanswered, any answer that needs a note lacks one, or any failed critical
  item lacks its photo.
- A **submitted inspection is a record**: it cannot be edited or deleted, by
  anyone, including a super admin. Correcting it means a new visit.
- Only the inspector who started a draft may write to it.
- An answer must belong to the checklist version the inspection was started
  against.

### Still to build

1. ~~Postgres schema + seed importer.~~ Done.
2. ~~Inspection API — drafts, autosave, submit.~~ Done.
3. The inspector UI, following the prototype's screens and ordering.
4. Photo and signature upload, reusing `storage.ts` (the API takes URLs today).
5. Report PDF, emailed and logged.
6. Cross-centre dashboard aggregations.

Before real data: a UK/EU region, a retention policy and a DPIA — inspection
photos are taken in a children's setting.
