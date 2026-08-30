# GoTutors Inspection App

Centre inspection tooling: an inspector walks a centre during a live session,
works through a 101-question checklist across 15 sections, records notes and
photo evidence against failures, and leaves with a scored report and a debrief.

**This is a separate application.** It lives in this repository beside the
GoTutors Academy LMS but shares nothing with it — its own database, its own user
accounts, its own dependencies, its own port. Run them independently.

Because one repository holds both, three things could otherwise couple them, and
each is deliberately closed off:

| | |
|---|---|
| The Academy's `tsconfig.json` | excludes `inspection-app`, or it would type-check this app against the Academy's copies of shared packages |
| This app's `.eslintrc.json` | sets `"root": true`, so it does not inherit the Academy's config down the directory tree |
| `.github/workflows/ci.yml` | one file, because Actions is per-repository — but each app runs as its own job, and only when its own files change |

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

This folder is **part of the GoTutors-Academy repository**, not a repository of
its own. Clone the repo first, then work inside this folder.

```bash
git clone https://github.com/yousifGT/GoTutors-Academy.git
cd GoTutors-Academy/inspection-app
npm install
```

Create your `.env` from the example:

```bash
cp .env.example .env      # Windows CMD:        copy .env.example .env
                          # Windows PowerShell: Copy-Item .env.example .env
```

Fill in four values. Generate the secret with Node, which you already have —
there is no `openssl` on a stock Windows machine:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```
NEXTAUTH_SECRET="<the hex string from above>"
NEXTAUTH_URL="http://localhost:3100"
SEED_ADMIN_EMAIL="you@gotutors.com"
SEED_ADMIN_PASSWORD="at least 12 characters"
```

Then start the database, create the schema, and run it:

```bash
docker compose up -d      # Postgres on port 5434 — its own database
npm run db:deploy         # apply the migrations
npm run db:seed           # checklist v13, the 23 centres, your admin account
npm run dev               # http://localhost:3100
```

### Changing the schema

```bash
npm run db:migrate        # dev: edit schema.prisma, then generate a migration
npm run db:deploy         # anywhere real: apply what is already committed
npm run db:status         # what has and has not been applied
```

`npm run db:push` still exists for a throwaway experiment, but it is not the
normal path: it makes the database match the schema by whatever means necessary,
including dropping a column, and leaves no history to roll back. CI applies the
migrations to an empty database and then checks they produce exactly what
`schema.prisma` describes, so a change that was never migrated fails there
rather than on a real database.

Migrations are not run by the container on start: two instances would race, and
a failure would take the whole rollout down rather than one container. Run
`npm run db:deploy` as a release step.

Sign in with the email and password you put in `.env`.

### Without Docker

Any Postgres will do — a local install, or a free hosted database. Create an
empty database and point `DATABASE_URL` at it, then run `db:push` and `db:seed`
as above:

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public"
```

### If something goes wrong

| Message | What it means |
|---|---|
| `Could not read package.json` | You are not in the `inspection-app` folder of the clone. `cd` into `GoTutors-Academy/inspection-app`. |
| `no configuration file provided` (docker) | Same — `docker-compose.yml` lives in this folder. |
| `'cp' is not recognized` | Windows CMD: use `copy` instead. |
| `Can't reach database server` | The database isn't running, or `DATABASE_URL` is wrong. Check `docker compose ps`. |
| `No active checklist` | `npm run db:seed` hasn't been run yet. |
| Sign-in is rejected | The seed only creates an account when both `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are set. Set them and re-run `npm run db:seed`. |

Port **3100**, database port **5434** — chosen so both can run at the same time
as the Academy (3000 / 5433) without colliding.

There are **no demo accounts**. The seed creates one administrator from
`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`, and nothing at all if those are
unset. Inspection records include photographs taken in a children's setting, so
a known-password account must never exist by default.

### The screens

| Screen | What it does |
|---|---|
| `/login` | sign in |
| `/` | centres, checklist version, drafts to resume, recent visits |
| `/planner` | which centres need a visit, and booking one (head office and regional managers) |
| `/reports` | every inspection the viewer may see, filterable |
| `/admin/users` | accounts and roles (super admin) |
| `/admin/centres` | the centre list, sizes, open/closed (head office and above) |
| `/profile` | change your own password |
| `/inspections/new` | pick a centre and its size for today |
| `/inspections/[id]` | the inspection itself |
| `/inspections/[id]/report` | the finished record |

The inspection screen is built for a phone held one-handed while walking a
centre. A sticky bar carries the live score, the active clock and the save
state; a red band appears the moment a critical item fails. Sections are tabs
showing answered-of-total, so it is obvious what is left. Each question takes an
answer, then as many note entries as needed — the Teaching Observation sections
tag each one with a tutor, because an inspector circulates between tables.
Photos come straight from the camera. Guidance, including the do and don't
lists, is a tap away on any question that has it.

The score is recomputed in the browser on every tap using the same
`inspection-core.js` the server scores with, so the number on screen and the
number recorded cannot disagree. Everything autosaves; leaving mid-visit and
coming back resumes exactly where you were, timer included.

The debrief screen states what is still outstanding — unanswered questions,
answers owing a note, critical failures owing photo evidence — with links
straight to them, and keeps the submit button disabled until there is nothing
left. Submitting locks the inspection; reopening it goes to the report.

`prototype/centre-inspection-app.html` is kept as the original single-file
version the screens were ported from.

## Roles

| Role | Reads | Inspects | Receives reports | Edits the checklist |
|---|---|---|---|---|
| Super admin | every centre | yes | — | yes |
| Head office | every centre | yes | — | yes |
| Regional manager | their centres | yes | yes | no |
| Franchisee | their centres | no | yes | no |
| Head of centre | their centres | no | yes | no |
| Inspector | their own visits | anywhere | — | no |
| Read only | every centre | no | — | no |

A head of centre runs a site: they read its inspections and receive its reports,
but never carry one out, because a centre cannot inspect itself. A centre-scoped
viewer with no centres assigned falls back to their own work, never to
everything.

An inspector's centre assignment says **where their work is, not what they may
read**. It appears on their home screen as "your centres" and never stops them
being sent elsewhere — so a visiting inspector still works, and a covering
inspector does not need their assignment edited first.

### Planning visits

Two different things, deliberately kept apart. The standing assignment above says
where someone generally works. A **scheduled visit** is one person, one centre,
one day — the thing an inspector opens the app to see.

Head office and regional managers book visits from `/planner`, which leads with
the centres that need one: never inspected, or more than 30 days since the last
one, and nothing already in the diary. A centre with a visit booked drops off
that list however long it has been — the list is for gaps nobody has picked up,
and leaving booked ones on it teaches people to ignore it.

The inspector sees today's visit at the top of their home screen with the note
that came with it and a Start button that arrives at the checklist with the
centre already chosen. Starting it links the inspection to the booking and marks
it done, so a planned day and the record of what happened are one story rather
than two lists to reconcile by eye. A day that passes with no inspection shows as
missed rather than quietly disappearing — a visit nobody made is exactly the
thing worth knowing about.

### Findings that have not been fixed

A first failure is a finding. The same failure at the next visit says the
debrief was heard and nothing was done, which is the most useful thing an
inspection produces — and it is only visible by comparing two visits, so the app
works it out rather than leaving someone to spot it.

During a visit, a question the last inspection flagged is badged **Flagged last
visit** before it is answered — the point is that the inspector looks, not that
they find out afterwards. Answer it badly again and the badge becomes **Still
not fixed**, and the sticky header counts them. The report and the PDF both lead
with a "Not fixed since the last visit" block ahead of everything else.

Comparison is by question text, not question id: the checklist is versioned, and
a visit run against v13 must still be comparable with one run against v14. Every
answer snapshots its question text for exactly this reason. A finding that has
since been put right simply stops appearing — that is the point of tracking it.

### Working with no signal

An inspection is mirrored to the device as it is filled in, so a centre with no
reception costs nothing. The header says **Offline** and tells the inspector to
keep going; answers, notes and photo references are held locally, and the moment
the connection is back everything queued is sent and the local copy is dropped.

The mirror is written *after* the render that applied a change, not in the
handler that requested it — React state is not updated synchronously, so writing
from the handler stores the previous answers and loses whichever change was made
last, which is the one most likely to be lost anyway.

Only work the server has not seen is ever restored: the local copy carries the
time it was written and is used only when it is strictly newer than the
inspection's own `updatedAt`. A copy that is malformed, belongs to another
inspection, or is more than a fortnight old is discarded rather than restored,
and every call is wrapped — `localStorage` throws outright in some private modes
and when full, and losing the mirror must never take the inspection down with it.

The size is still chosen by the inspector even when arriving from a booking: it
decides how several questions are marked, and a centre can be busier or quieter
than its default on the day.

### Settling a booked day, and attendance

Starting an inspection marks its visit done by itself. A booked day that passes
with nothing recorded needs a person: the planner lists those separately and
asks what happened — it was visited and written up elsewhere, or it was missed.

Marking someone missed demands a reason and records who decided it, so a mark
against an inspector's name always says who made it and why. A future visit
cannot be marked missed; cancel it instead. The one thing no status can override
is an inspection already on the record — that is evidence the visit happened, so
such a booking can only be done, and cannot be deleted.

Attendance is the share of *settled* visits that were made. Days nobody has
looked at yet are counted separately and left out of the figure: an unresolved
day is a gap in the paperwork, not a mark against the inspector, and folding the
two together would make the number dishonest. A cancelled visit counts against
nobody.

### Reports reaching the people who run the centre

Submitting an inspection writes a `ReportDelivery` row for everyone responsible
for that centre. That is what makes a report hard to miss: an unread row is
still there tomorrow, unlike a notification that gets glanced past. The count
appears on their home screen, the row is badged **New** until they open the
report, and `readAt` records that they actually opened it rather than merely
received it.

`/reports` is the shared history screen, scoped to whatever the viewer may see —
every centre, their own centres, or their own visits. Filter by centre, by month
(only months that contain something are offered), by status, or "new only";
search by centre, inspector or verdict. Every completed row has a PDF button.

Emailing the PDF out is still to come; today the report lands in the account.

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
| `GET/POST /api/users`, `PATCH/DELETE /api/users/:id` | accounts (super admin) |
| `POST /api/centres`, `PATCH/DELETE /api/centres/:id` | centres (head office and above) |
| `GET/POST /api/visits`, `PATCH/DELETE /api/visits/:id` | the visit diary |
| `GET /api/coverage` | which centres need a visit, worst first |
| `POST /api/me/password` | change your own password |
| `POST /api/uploads` | store one photo or signature, returns its URL |
| `GET /api/inspections/:id/pdf` | the report as a PDF (`?inline=1` to view rather than download) |

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
3. ~~The inspector screens.~~ Done, including the session tally counters.
4. Photo and signature upload (the API takes URLs today).
5. Report PDF, emailed and logged.
6. Cross-centre dashboards, CSV export, signature capture, an audit-log viewer,
   and a screen for editing the checklist.

Before real data: a UK/EU region, a retention policy and a DPIA — inspection
photos are taken in a children's setting. See `docs/BACKEND-HANDOFF.md` §5.
