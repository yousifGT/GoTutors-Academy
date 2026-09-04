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

The password must be at least 12 characters and cannot contain `password`,
`admin`, `gotutors`, `12345678`, `qwerty` or `letmein` — the seed refuses it
otherwise, rather than creating an administrator account with a guessable
password on a system holding photographs from a children's setting.

`db:seed` is a **first-time import**. It replaces the checklist's questions in
place, and `Answer.questionId` is a foreign key — so once a single inspection
has been recorded against a version, its questions cannot be replaced. The seed
checks for that and refuses with an explanation rather than failing halfway on a
constraint error, and it likewise refuses to run if a newer version already
exists, which would quietly roll the live standard back.

Changing the checklist after go-live is done in the app, under **Admin →
Checklist**. See [Editing the checklist](#editing-the-checklist).

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
| `/admin/audit` | what was done, by whom and when (head office and above) |
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
| Head office | every centre | yes | — | no |
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

### Activity

Every account change, submission, report download and missed-visit mark is
written to an audit log, and `/admin/audit` reads it back — filter by kind, by
person or by date, and search. Until something reads it, an audit trail is a
liability rather than a control: it costs storage, tells nobody anything, and is
only discovered to be incomplete when someone actually needs it.

A super admin sees everything. Head office sees the operation — centres,
inspections, visits — but not account administration: that is the record of who
holds access, and the people who hold access should not be the only ones able to
read it quietly. Nobody else sees the log at all. The filtering happens in the
query rather than after fetching, so a page of results is never silently short.

An action nobody has given a name to is shown under its raw name rather than
hidden — that means the log has outgrown the table describing it, which is
exactly when it must not disappear. Entries hold plain ids rather than foreign
keys so the log survives the person or the inspection being deleted; a removed
account reads as "(deleted account)" rather than as nobody.

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

The corollary, worth knowing before rewording a question in the editor: text is
the thread that ties a finding to the same finding at the next visit. Reword a
question and its history stops following it — the old failure is on the old
wording and will not be matched. Correcting a typo is fine; rewriting a question
that centres are being held to is a decision about the record, not only about
the wording.

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

### Where the photographs go

Every photo and signature is stored under a random name and written into the
database as **an app path**, `/api/uploads/photos/<name>.jpg` — never a place in
a bucket. Serving them goes through that route, which decides per request
whether the person asking may see the inspection the image belongs to. A random
name makes a URL hard to guess, and "hard to guess" is not an access policy for
photographs taken inside a children's setting.

Two backends sit behind that one path:

| | |
|---|---|
| **local disk** (default) | `var/uploads` — deliberately not under `public/`, which Next serves as static files with no session and no scope check. Runs with nothing else installed. Not for production: a container filesystem is wiped by every redeploy, and two instances behind a load balancer cannot see each other's files. |
| **S3** (`UPLOAD_BACKEND=s3`) | AWS S3, or anything speaking its API — MinIO, Cloudflare R2 — via `S3_ENDPOINT`. |

The bucket is expected to be **private**. The app reads objects out of it and
streams them on, rather than redirecting a browser to a presigned URL: a
presigned URL is a working link to a photograph for as long as it lasts, to
anyone it is forwarded to, and it drags the app's content-security policy open
to allow it. At the volume one inspection produces, that is not a trade worth
making.

On AWS, leave `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` unset and give the
task or instance role `s3:GetObject`, `s3:PutObject` and `s3:DeleteObject` on the
bucket — no long-lived secret to leak or rotate. `GET /api/health` returns 503 if
the bucket cannot be reached, so a misconfigured deploy is caught by the load
balancer rather than by an inspector losing a photograph on site.

Rows written before uploads moved behind that route still say `/uploads/...`.
Those keep working, and are now checked too: a rewrite sends that path through
the same authenticated route, and when the store is S3 but an object is not in
the bucket it falls back to disk, so an app switched over still serves
everything photographed before the switch.

**Sweeping what is left behind.** A photo uploaded and never attached — the
inspection was abandoned between taking it and the autosave — or one removed
from an answer leaves an object nothing points at. `npm run uploads:gc` reports
them; `npm run uploads:gc -- --apply` deletes them, ignoring anything uploaded in
the last day so a visit in progress is never touched. Worth running on a
schedule: a photograph belonging to no inspection has nobody reviewing it. It is
a maintenance script, not part of the served app — the runtime image prunes the
dev dependencies it needs, so run it from a checkout with the production
`DATABASE_URL` and the same `S3_*` settings.

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

**And again, on purpose.** Submitting emails it once, automatically. The report
page also carries a **Send by email** panel: who receives this centre's reports,
whether it has actually reached each of them and when, and a button to send it
again. That is for afterwards — it never arrived, the address was wrong and has
been corrected, or the head of centre was appointed after the visit and was
never on the list. It goes through the same delivery row and the same lease as
the automatic send, so a re-send is part of that report's history rather than a
separate untracked act, and it is written to the audit log with the address it
went to.

It sends only to addresses registered on accounts, never to one typed into the
request, and only the people who carry out or oversee inspections may press it —
not a read-only account, and not the centre head, who would be emailing
themselves.

**And into their inbox.** Submitting also emails the report, with the PDF
attached, to each of those people. The message names the centre, the date, the
verdict and the score in its subject line — that is what shows in a list of
unread mail — and links back to the report on the site rather than restating the
findings, so there is only ever one version of them.

Sending is state on the delivery row, not a fire-and-forget call: `emailStatus`,
the address it went to, when, how many attempts, and the last error. "It was
emailed" is a claim someone will one day have to stand behind. The submit
triggers a send immediately, without making the inspector's phone wait for it,
and a sweep inside the app picks up anything that attempt did not finish —
a task replaced mid-send, SES throttling, an address briefly unreachable. Failed
attempts back off (a minute, five, twenty-five, two hours) and then stop at
`FAILED`, which needs a person, rather than retrying out of sight forever.

Set `EMAIL_BACKEND=ses` (or `smtp`). Left unset, messages go to the log instead
of being sent — right on a laptop, and refused at boot on a deployment, so a
forgotten setting cannot quietly mean nobody was told.

## API

| Route | What it does |
|---|---|
| `GET /api/template` | the live checklist, in inspector order |
| `GET /api/export` | the same inspections as a CSV (`?type=inspections\|answers` plus the list filters) |
| `PUT /api/template` | replace the checklist (super admin); edits in place or publishes the next version |
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
| `GET /api/audit` | the activity log, filtered to what the role may read |
| `POST /api/me/password` | change your own password |
| `POST /api/password/forgot` | ask for a reset link; answers identically whether or not the address exists |
| `POST /api/password/reset` | spend a link, set the password, and revoke every session the account had |
| `POST /api/uploads` | store one photo or signature, returns the URL to save against the answer |
| `GET /api/uploads/:kind/:name` | serve one stored image, to whoever may see the inspection it belongs to |
| `GET /api/health` | for a load balancer: 200 when the database and the object store answer, 503 when either does not |
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

The S3 backend is tested against a real S3 API rather than a mock — point
`S3_ENDPOINT` at a MinIO or `moto` server, set `UPLOAD_BACKEND=s3`, and run the
app against it. Two things only that turns up: the app's own content-security
policy blocks a browser from following a redirect to the store, and
`Readable.toWeb` does not survive the bundler.

Email is tested the same way, against a real SMTP server rather than a mock, so
what the mailbox holds is the exact MIME message that would go to SES.

Neither of those, nor a green build, is what catches the worst kind of
regression. Upgrading to Next 16 built cleanly, type-checked cleanly, passed
every unit test — and silently stopped pre-selecting the centre when an
inspector starts a booked visit, because `searchParams` became a promise and
reading a property off a promise is `undefined` rather than an error. Only
driving the app in a browser found it.

The rules in `core/` test themselves with `node --test`, exactly as they ship.
Everything else runs under Vitest. The core suite also asserts the shipped
checklist still matches: 15 sections, 101 questions, 23 centres, 8 critical items.

## A centre over time

**`/centres/<id>`** — the question the person running a centre actually has, which
is whether it is getting better. The report answers "how was this visit"; this
answers "am I getting anywhere", and in particular tells them what they were
asked to fix and have.

That half was missing. The report has always led with what was flagged *again*,
and nothing anywhere worked out what had been **put right** — so a centre head
read every report as a list of failures with no way to see that six of last
quarter's ten findings were gone.

Four things can have happened to a finding since the last visit, and the page
keeps them apart:

| | |
|---|---|
| **Put right** | flagged last visit, answered acceptably this time |
| **Still not fixed** | flagged last visit and flagged again |
| **New this visit** | flagged for the first time |
| **Not checked again** | flagged last visit and not answered this time — unanswered, marked N/A, or no longer on the checklist |

The fourth is separate from the first on purpose. A question nobody asked again
is not a problem anybody solved, and folding the two together would report
progress that never happened.

Alongside them: the latest score and verdict with the change in points, the
critical items outstanding, a trend of the score at each visit, everything still
flagged with **how many visits running** it has been (a finding raised three
visits in a row is a different thing from one raised once), and the full visit
history.

Comparison is on question wording, the same thread the repeat badges use, since
the checklist is versioned and question ids do not survive a new version. Reword
a question in the editor and its history stops following it — the old finding
reads as dropped and the new wording as new. See `src/lib/progress.ts`.

**Finding one**: `/centres` lists every centre the viewer reads in full, with
its latest score, the move since the visit before, and who runs it. It can be
searched by centre, address or head, and ordered by lowest score, longest since
a visit, or biggest fall — the three questions someone responsible for all of
them actually asks. A head of centre sees only their own centre there.

**Who sees it** is `readsWholeCentre` in `src/lib/access.ts`: the roles that
already read every inspection at that centre — super admin, head office,
read-only, and the centre's own head, franchisee or regional manager. An
inspector is not among them, deliberately: they read only their own visits, so
"since the last visit" would be measured against a visit that was not the last
one, which is worse than no dashboard because it reads as fact.

A head of centre reaches it from their home screen, which lists their centres
with the latest verdict; head office and the super admin from **Centres** in the
header; anyone from the **Progress** button on the inspections list, or from any
report.

### A visit keeps the checklist it started with

Questions must not appear or vanish while somebody is halfway round a building,
so an inspection is always answered against the version it was started on. That
is right, and it used to be invisible: publish a new checklist, press "Start
inspection" at a centre where a draft was already open — which resumes it rather
than starting a second one — and the old questions came back with nothing on
screen to say why.

Now the top bar carries the version, a draft on anything but the live checklist
says so and says what to do about it, and a draft can be discarded from the home
screen where you actually meet it rather than only from the far end of the
inspection you want to be rid of.

## Taking the data out

**Download as CSV**, on the inspections list and on each centre page. Two
shapes, because two different questions get asked of the same rows:

- **Inspections** — one row per visit: score, verdict, the four answer counts,
  critical failures, how many findings were put right / still not fixed / new,
  time on site, checklist version, who the debrief was with, and a link back to
  the report.
- **Answers** — one row per answer: section, question as worded on the day,
  type, whether it is critical, the answer in the words the report uses, the
  result, whether it is a repeat, the notes with the tutor each is about, and a
  photo count.

Both read through `inspectionWhere` — the same filter the list screen uses — so
a file can never cover a different set from the page it was taken from, and both
are scoped to what the viewer may already read one report at a time. A head of
centre gets their centre; an inspector gets their own visits.

Two things `src/lib/csv.ts` handles that a join-with-commas would not:

- Notes are free text holding commas, quotation marks and line breaks. A note
  broken across two rows silently misaligns every column after it.
- A cell beginning `=`, `+`, `-` or `@` is a **formula** to Excel, Sheets and
  LibreOffice alike, and these notes are typed by people on site into a system
  holding photographs from a children's setting, then emailed onwards. Such a
  cell is prefixed with an apostrophe so it arrives as text.

The file opens as UTF-8 in Excel (byte-order mark), uses RFC 4180 line endings,
and is served `no-store`. Size is capped — 2,000 inspections, or 500 for the
answers file — and going over is refused with a message saying to narrow the
range, rather than returning a truncated file that looks complete. **Every
export is written to the audit log** with who took it, how many rows, and what
it covered: it adds no visibility, but it changes how much leaves in one go.

## Testing it quickly

Answering 101 questions is a poor way to check that a submit button works.
`data/demo-checklist.json` is a **two-question** checklist for walking the whole
app in about a minute:

```bash
npm run db:seed:demo      # switch to the two-question checklist
npm run checklist         # which version is live?
npm run checklist -- 13   # switch back to the real one
```

It imports as **version 100**, beside the real checklist rather than over it, so
inspections already recorded keep pointing at the version they were carried out
under and nothing you have already done is disturbed. `npm run checklist` lists
every version with its question count and how many inspections were run against
it; passing a number makes that one live. Nothing already recorded moves — this
only decides what the *next* inspection is run against. It is also the rollback
path if a published version turns out to be wrong, since the seed deliberately
refuses to go backwards on its own.

Two questions, chosen to exercise most of what the app does:

1. **a critical rating** — failing it requires a note *and* a photograph before
   the inspection can be submitted, and caps the whole thing at "Serious
   finding" whatever the percentage;
2. **a number** with a session counter and a per-size target — it puts a
   tap-to-count button on the top bar, and a count below the target for that
   centre's size is flagged as an improvement point.

Between them that covers the answer buttons, the note and photo requirements,
the critical override, the tally counters, size-based flagging, the score, the
report, the PDF, and the centre page.

`npm run db:seed` takes an optional path, so any file in the same shape works:
`npm run db:seed -- data/my-checklist.json`.

## Editing the checklist

**Admin → Checklist**, super admin only. `canManageTemplate` in
`src/lib/access.ts` is the single gate: the page redirects, the nav link is
absent, and `PUT /api/template` answers 403. Head office runs the operation and
reads all of it, but the checklist is the standard the operation is judged
against, and setting that is kept with the one role that also holds account
administration.

The whole checklist is one document, edited and saved in one request. Sections
and questions can be added, reworded, reordered, moved between sections and
removed; a question carries its type, its options or bounds, its size targets,
whether it is critical, and the guidance the inspector reads on the day.

### Why it does not simply overwrite

`Answer.questionId` is a real foreign key. An answer must keep pointing at the
question it was an answer to, so a question that has been answered cannot be
edited away. `Template.version` is the way out:

- A version **no inspection has used** is still a draft, and is saved in place.
- A version **one or more inspections have used** is a historical record. Saving
  copies the whole checklist to `version + 1`, makes the copy live, and edits
  that.

Drafts count as use. An inspector standing in a centre halfway through a visit
finishes on the checklist they started with — questions never appear or vanish
mid-inspection — and recorded inspections keep rendering exactly as they were,
because each one holds the version it was carried out under.

Versions therefore climb only when the checklist has actually been *used* since
the last edit. Three corrections on the morning it is written all stay on the
same version. The editor says which of the two will happen before you press the
button, and the button reads "Save changes" or "Publish v14" accordingly.

Two people editing at once is caught rather than silently resolved: a save
carries the version it was built on, and one built on a version that has since
moved on is refused with a 409 saying so.

### What it will not let you save

Checked in `src/lib/checklist.ts`, in the browser as you type and again on the
server:

- a multiple choice with fewer than two options, or two options that read the
  same — the question would be unanswerable
- a scale whose top is not above its bottom — `itemScore` divides by the range
- an empty checklist, an empty section, an unworded question
- a session counter key the tally bar has no label for

Settings a question's type does not read are stripped rather than stored: a
rating question cannot keep options, `photoExempt` only survives on a critical
item, and `scored` only on a multiple choice. A stored field nothing reads is a
trap — it survives a type change and quietly starts being read again if the type
is switched back.

Every save is written to the audit log as `template.publish` or
`template.update`, with the version, the counts, and how many questions were
added, removed and edited. That group is readable by the super admin alone.

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
4. ~~Photo and signature upload.~~ Done, on local disk or S3.
5. ~~Report PDF, generated, logged and emailed.~~ Done — a submitted report is
   attached to a message to whoever runs the centre, with retries and a delivery
   record, and is also waiting in their account.
6. ~~A screen for editing the checklist.~~ Done — see
   [Editing the checklist](#editing-the-checklist).
7. ~~A per-centre progress view and CSV export.~~ Done — see
   [A centre over time](#a-centre-over-time) and
   [Taking the data out](#taking-the-data-out).
8. Cross-centre dashboards (every centre at once, ranked) and signature capture.
9. ~~Password reset.~~ Done.

## Deploying it

`docs/DEPLOY.md` is the AWS runbook: what the app needs and why, the IAM policy,
the task definition, the release step for migrations, what to check once it is
up, and what it costs. It also lists the decisions that belong to GoTutors
rather than to this repository — chiefly how long photographs are kept.

The app refuses to start if it can detect that its configuration is wrong: a
placeholder session secret, http on a deployed host, photographs pointed at a
container filesystem, report emails pointed at the log. See `src/lib/config.ts`.

Before real data: a UK/EU region, a retention policy and a DPIA — inspection
photos are taken in a children's setting. See `docs/BACKEND-HANDOFF.md` §5.
