# GoTutors Inspection App

Centre inspection tooling: an inspector walks a centre during a live session,
works through a 101-question checklist across 15 sections, records notes and
photo evidence against failures, and leaves with a scored report and a debrief.

**This is a separate application.** It lives in this repository beside the
GoTutors Academy LMS but shares nothing with it — its own database, its own user
accounts, its own dependencies, its own port. Run them independently.

```
inspection-app/
  core/       inspection-core.js — the scoring rules, shared by server and browser
  data/       gotutors-seed.json — checklist v13 + the 23 centres
  docs/       BACKEND-HANDOFF.md — the original specification
  prisma/     schema + seed
  prototype/  centre-inspection-app.html — the original single-file app
  src/        the Next.js application
```

## Running it

```bash
cd inspection-app
npm install

cp .env.example .env
#   NEXTAUTH_SECRET   →  openssl rand -hex 32
#   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD  →  your first login

docker compose up -d      # Postgres on port 5434 — its own database
npm run db:push
npm run db:seed           # checklist v13, the 23 centres, your admin account

npm run dev               # http://localhost:3100
```

Port **3100**, database port **5434** — chosen so both can run at the same time
as the Academy (3000 / 5433) without colliding.

There are **no demo accounts**. The seed creates one administrator from
`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`, and nothing at all if those are
unset. Inspection records include photographs taken in a children's setting, so
a known-password account must never exist by default.

### What you can see today

- **Sign in**, and a home screen listing centres, the live checklist version and
  recent visits with their scores.
- **The API** below, working end to end.
- **The prototype** (`prototype/centre-inspection-app.html`) — open it in a
  browser, no server needed. It remains the definitive spec for the inspector
  screens, their ordering and the branding.

The inspector screens themselves are the next piece of work; until they land,
the prototype is how an inspection actually gets carried out.

## Roles

| Role | Reads | Inspects | Edits the checklist |
|---|---|---|---|
| Super admin | every centre | yes | yes |
| Head office | every centre | yes | yes |
| Regional manager | their centres | yes | no |
| Franchisee | their centres | no | no |
| Inspector | their own visits | anywhere | no |
| Read only | every centre | no | no |

An inspector has no centre list — they go where they are sent, and see their own
work afterwards. A franchisee is the mirror image: tied to centres, never
holding the clipboard. A centre-scoped viewer with no centres assigned falls back
to their own work, never to everything.

## API

| Route | What it does |
|---|---|
| `GET /api/template` | the live checklist, in inspector order |
| `GET /api/centres` | the centres this viewer may work with |
| `GET /api/inspections` | list, scoped to the viewer (`?centre=&from=&to=&limit=`) |
| `POST /api/inspections` | start a visit; returns the open draft if one already exists for that inspector, centre and day |
| `GET /api/inspections/:id` | one inspection with its checklist, answers and live score |
| `PATCH /api/inspections/:id` | autosave — answers, notes, photos, `activeMs`, debrief |
| `POST /api/inspections/:id/submit` | close it: score on the server, write the buckets, lock it |
| `DELETE /api/inspections/:id` | discard a draft |

Rules the API enforces, not just the UI:

- The **score is computed server-side** from the stored answers, never taken from
  the request.
- **Submission is refused** (422, listing what is outstanding) while any question
  is unanswered, any answer that needs a note lacks one, or any failed critical
  item lacks its photo.
- A **submitted inspection is a record**: it cannot be edited or deleted, by
  anyone, super admin included. Correcting it means another visit.
- Only the inspector who started a draft may write to it.
- An answer must belong to the checklist version the inspection was started
  against.
- Reads are **scoped in the query**, so an inspection outside a viewer's reach is
  simply "not found" rather than "forbidden" — the endpoint never confirms it
  exists.

## `core/inspection-core.js`

Every rule that decides a score, a report bucket, a verdict, or whether a note or
photo is required. No dependencies, no DOM, no storage — the same file runs in
Node (`require`) and in the browser (`window.InspectionCore`). Ships as-is from
the handoff; treat it as the one source of truth and change it deliberately.

```js
const core = require("./core/inspection-core.js");
const r = core.scoreInspection(sections, "medium");
// { pct, scored, well, poor, obs, unanswered, criticalFails: [text], verdict }
```

| Rule | Behaviour |
|---|---|
| Scoring | rating pass/improve/fail → 1 / 0.5 / 0 · yes-no → 1 / 0 · scale normalised over its own min–max · scored choice ranked best-first. Numbers, N/A and unanswered don't count. |
| Buckets | ≥ 0.7 **well** · ≤ 0.5 **improve** · in between an **observation**. Numbers are observations unless they fall under their size target. |
| Verdict | ≥ 85% Good · ≥ 65% Satisfactory · below that Needs attention. |
| **Critical override** | **Any failed critical item makes the verdict "Serious finding", however high the percentage. A centre with one blocked fire exit cannot be rated Good.** |
| Notes | Only a clean pass-like answer may skip a note; `requireNote` questions always need one. |
| Photos | A failed **critical** item needs photo evidence — unless it is `photoExempt` (DBS records are written up, never photographed). |
| Guidance | Size-aware: the line for this centre's size, or all three when the size is unknown. |
| Duration | `fmtDuration(activeMs)` — the stored clock is accumulated *active* time, not start→end. |

**Centre size is not optional.** `bucketOf`, `notesRequired`, `criticalFail`,
`photoRequired`, `resolveGuide` and `scoreInspection` all take it as their second
argument. A number question carrying `minBySize` — the toilet-pass count today —
resolves its bucket from it, and a critical one can flip the whole verdict on
size alone. `src/lib/score.ts` bridges database rows to these rules and makes
size a **required** argument, which is what stops a bucket being computed without
one.

The prototype carries its own inlined copy of these rules. A rule change has to
land in both until the inspector screens replace the prototype.

## Tests

```bash
npm test          # both suites
npm run test:core # the rules alone, no bundler — plain node --test
```

The rules in `core/` test themselves with `node --test`, exactly as they ship.
Everything else runs under Vitest. The core suite also asserts the shipped
checklist still matches: 15 sections, 101 questions, 23 centres, 8 critical items.

## Data

`data/gotutors-seed.json` is checklist **v13** in the prototype's own export
shape:

```
{ config: { checklistVersion, configVersion, passcode, centres, template }, inspections: [] }
```

Re-running `npm run db:seed` is safe. Centres are matched by name and never
overwritten. Re-importing the same `checklistVersion` updates that template in
place; a new version publishes a new template beside it and marks the old one
inactive, so inspections already recorded stay readable against the checklist
they were run under.

## Still to build

1. ~~Database schema and seed importer.~~ Done.
2. ~~Auth, roles, and the inspection API.~~ Done.
3. The inspector screens, following the prototype.
4. Photo and signature upload (the API takes URLs today).
5. Report PDF, emailed and logged.
6. Cross-centre dashboards.

Before real data: a UK/EU region, a retention policy and a DPIA — inspection
photos are taken in a children's setting. See `docs/BACKEND-HANDOFF.md` §5.
