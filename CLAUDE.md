# GoTutors Academy — working notes

## How to work in this repo

**Read the file before naming a cause.** Every wrong diagnosis in this project's
history came from reasoning about the code instead of opening it. If you cannot
check, say "I don't know yet" rather than offering a plausible answer — a
confident wrong cause costs more than an admitted gap.

**Before changing a form, read the route it submits to.** A commit once made a
field visible and editable on the user edit page while the API rejected every
save of it, so the feature could not work at all. The read path and the write
path are separate files and they drift.

**Same resource, same rules on create and edit.** POST and PATCH for the same
model have twice diverged (email lowercased on create but not on edit; field
names resolved differently). When touching validation on one, open the other.

**Verify with the running app, not with reasoning.** `npm test` and `tsc` pass
happily on logic that is wrong end to end. The forced-password hold and the
video seek clamp were both green in unit tests and broken in the browser.

**Navigation after a session change needs a full page load.** `router.push` /
`router.replace` are served from Next's client router cache, which can still
hold a middleware redirect issued seconds earlier — so a soft navigation lands
back where it started even with a correct cookie. Use
`window.location.assign()` after anything that changes the session. Login is the
exception and does not need it: nothing is cached on a first visit, and
`signOut` already does a full load. `scripts/e2e-forced-password.mjs` drives a
real browser through the case that broke three times.

## Domain model — the part that causes bugs

A **sub-position is a training field** ("Science Trainee"), and fields belong to
roles whose `type` is `TRAINEE`.

- A trainee's in-progress fields are name strings in `User.subPositions`
  (`User.subPosition` is a legacy single column, kept mirrored).
- On certifying every published course of a field, `promotion.ts` moves the
  person to the **Tutor** role — which is itself `type: TRAINEE`, deliberately —
  removes the field from `subPositions`, and appends a *title* to
  `User.teacherPositions` via `tutorTitleFor()`.
- **Fields are matched by NAME across every trainee-typed role**, never scoped to
  one role. `auto-enrol.ts`, `field-training.ts`, `admin/roles/page.tsx` and both
  user write paths all do this. Scoping to a single role is the bug that made
  every promoted tutor uneditable.
- `tutorTitleFor` is **one-way and not injective**: "Maths", "Maths Trainee" and
  "Maths Tutor" all yield "Maths Tutor". `fieldNameForTutorTitle` matches forward
  against real field names because the transform cannot be reversed.
- `promotion.ts` is the only writer of `teacherPositions` in normal operation;
  the rename route now also rewrites it when a rename changes the tutor title.
  Nothing else may touch that column — damage there has no in-product repair
  path, because a title nobody can produce resolves to no field at all.
- **Two fields must never promote to the same title.** Create and rename both
  refuse it, and `fieldNameForTutorTitle` resolves deterministically if older
  data already contains a pair.
- **A field with holders cannot be deleted.** Holders are counted by name across
  every role and include tutors (who hold it as a title), because deleting also
  drops the field's course requirements — which can leave part-trained people
  reading as fully trained.

## Config

`.env` is **local only** — it is gitignored and excluded by `.dockerignore`, so it
never reaches GitHub or the image. Production reads its environment from the ECS
task definition. Never put the RDS connection string in `.env`; set it for a
single command in a throwaway shell when a production `db push` is needed.

Local database: Docker Postgres on **port 5433**, schema `public`.
Production: RDS, database `postgres`, schema `academy`.

## Commands

```
docker compose up -d          # local database
npm run dev                   # localhost:3000
npx prisma db push            # apply schema.prisma (no migrations dir — see below)
npx vitest run                # 301 tests
./node_modules/.bin/tsc --noEmit
npm run build
npm run image                 # build the image with the commit SHA baked in
npm run smoke -- <base-url>   # health, login, CSRF, redirect host, deployed commit
npm run db:create-admin       # bootstrap a super admin
```

## Known gaps

- **No migrations.** `prisma db push` straight at production, no `migrations/`
  directory, no reviewable diff, and `db push` will offer to drop columns on a
  rename. Take an RDS snapshot before any schema change.
- Rate limiting is an in-process Map — per container, not per user.
- Uploaded video on local disk does not survive a container replacement.
