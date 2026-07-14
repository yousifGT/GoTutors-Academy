# GoTutors Academy — Deep Audit

**Date:** 2026-06-25
**Branch:** `claude/sharp-mendel-4iswx8`
**Method:** Four parallel deep-dives — Authentication/Authorization, Input-validation/API-security, Data-integrity/Business-logic, and Code-quality/Reliability — each reading the whole codebase in its lane.

## Executive summary

The earlier security pass was **genuinely strong on the layers it touched**: every mutating route validates input with zod, CSRF is centralised, there's no SQL injection / `dangerouslySetInnerHTML` / `eval`, passwords are never returned, login is rate-limited and enumeration-safe, and privilege escalation through *user* management is blocked.

The remaining risk sits in **four layers the earlier pass didn't reach**:

1. **Object-level authorization on course authoring** — permission checks are global, not ownership-scoped. Any instructor can edit/delete/duplicate any other instructor's courses.
2. **Session freshness** — role, centre, and `active` status are trusted from a 7-day JWT and never re-checked, so deactivation and demotion don't take effect.
3. **Transactional integrity** — quiz attempts, certificate awards, course role-assignment edits, and centre deletes do read-then-write without transactions, producing race conditions, **silent data loss**, uncaught 500s, and stale `isTrained`/completion state.
4. **Reliability & scale** — ~25 routes have no error handling (a missing id returns a raw 500 instead of 404), dashboards and reports issue unbounded N+1 queries that will time out at scale, hot tables lack indexes, and the money paths (scoring, certification, permissions) have **zero test coverage** with no CI.

Counts — security & integrity: **2 Critical · 8 High · 9 Medium · 8 Low**. Code-quality & reliability: **7 High · 11 Medium · 8 Low** (some overlap the above; de-duplicated in the fix order).

---

## 🔴 CRITICAL

### C1 — Any instructor can edit / delete / duplicate ANY course
**Authorization · `src/app/api/courses/[id]/route.ts:19-51`, `courses/[id]/duplicate/route.ts:7-79`, plus all nested routes below**

The course routes check only `userHasPermission(COURSE_EDIT/DELETE/CREATE)` — permissions **every** instructor holds by default (`src/lib/permissions.ts:59-65`). They never load the course or compare `course.authorId` to `session.user.id`. So instructor A can:
- `PATCH /api/courses/<B's id>` — rewrite, unpublish, or re-target B's course
- `DELETE /api/courses/<B's id>` — delete it (cascades to all modules, lessons, quizzes, enrollments, certificates)
- `POST /api/courses/<B's id>/duplicate` — clone B's full content **including correct-answer keys** into their own account

The same missing-ownership flaw repeats on every course-content route:
- `courses/[id]/modules/route.ts:11-25` — add module to any course
- `courses/[id]/reorder/route.ts:14-46` — reorder any course (validates IDs belong to the course, but not that the actor owns it)
- `modules/[id]/route.ts` (PATCH/DELETE), `modules/[id]/lessons/route.ts` — edit/delete modules & add lessons anywhere
- `lessons/[id]/route.ts:33-96` — rewrite lesson content, video, and quiz questions/answers on any course

**Fix:** Add one helper `assertCourseOwner(session, courseId)` that resolves the object to its course (`module.courseId`, `lesson.module.courseId`) and enforces `authorId === session.user.id || roleType === "SUPER_ADMIN"`. Call it in every course/module/lesson route before mutating. This is the single highest-value fix.

### C2 — Deleting a centre throws an uncaught 500 (and dangling references)
**Data integrity · `prisma/schema.prisma:110`, `src/app/api/centres/[id]/route.ts:12`**

`User.centreId` has **no `onDelete`** rule, so Postgres defaults to restrict. `DELETE /api/centres/[id]` calls `prisma.centre.delete` with no pre-check, no user reassignment, and no try/catch. Any centre that ever had a user can't be deleted — Prisma throws `P2003` → unhandled 500. `Notification.centreId` is a bare `String?` with no relation, so a successful delete would also leave dangling values.

**Fix:** Inside a transaction, count dependent users and reject with 409 if any remain (mirroring the role/sub-position delete guards), or add `onDelete: SetNull`. Wrap in try/catch for `P2003`. (Note: there is also **no centre PATCH route at all** — centre rename/edit is currently impossible.)

---

## 🟠 HIGH

### H1 — Deactivated / demoted / moved users keep full access for up to 7 days
**Authorization · `src/lib/auth.ts:8-9,45-67`, `src/lib/permissions.ts:69-82`**

The session is a 7-day JWT. `roleType`, `roleId`, and `centreId` are baked into the token at login and copied to the session every request — nothing re-reads the DB. `active` is checked **only** at login. Consequences:
- Setting `active:false` on a user does **not** end their session — they keep acting for up to a week.
- Demoting a role or changing a centre doesn't take effect until the token refreshes; the stale token authorises the old role/centre everywhere, including the middleware route gate.
- `userHasPermission` reads role permissions live (good) but never checks `user.active`.

**Fix:** In the NextAuth `jwt` callback, re-load `active`/`roleId`/`centreId` and force sign-out when `active === false`; refresh role/centre from the DB rather than trusting the original token. At minimum add an `active` check inside `userHasPermission`.

### H2 — Quiz attempt submission is racy (bypass `retryLimit`, uncaught 500s)
**Data integrity · `src/app/api/quiz/[quizId]/attempt/route.ts:42-100`**

The handler reads previous attempts, computes count/lockout/"already passed" in JS, then `create`s — with **no transaction or row lock**. N parallel POSTs all read the same state and all insert, so a trainee can get **N attempts past `retryLimit`** and submit multiple passing attempts. The 10/min rate limit doesn't stop a same-second burst.

**Fix:** Wrap read+create in a `Serializable` transaction (the last-super-admin delete at `users/[id]/route.ts:126-145` is the model to copy) and re-derive count/passed/locked inside it.

### H3 — Certificate award is racy and can 500 / leave certificate without completion
**Data integrity · `quiz/[quizId]/attempt/route.ts:152-184`, `quiz/attempt/[id]/review/route.ts:114-144`**

`maybeAwardCertificate` does count → `findUnique` → `create` → `enrollment.update` → `recomputeIsTrained` with **no transaction**. The `@@unique([userId, courseId])` prevents true duplicates, but `certificate.create` has **no try/catch**, so a concurrent second award throws an uncaught `P2002` 500. The `enrollment.update` is `.catch(() => {})`, so if the enrollment is missing, completion is silently dropped while the certificate still exists.

**Fix:** Put count → existence-check → create → enrollment.update in one transaction; wrap `create` in try/catch treating `P2002` as already-awarded; stop swallowing the enrollment update (a missing enrollment is itself an integrity error worth logging).

### H4 — `isTrained` goes stale when an admin changes sub-position / role / centre
**Data integrity · `src/app/api/users/[id]/route.ts:84-92`, `src/lib/training.ts:10-40`**

`isTrained` means "holds a certificate for every published course assigned to this trainee's role + sub-position." It's only recomputed in the two quiz routes. When an admin PATCHes a trainee's `subPosition`/`roleId`/`centreId`, `recomputeIsTrained` is **never called** — so a trainee moved from a fully-certified sub-position to a new one stays `isTrained=true` despite meeting none of the new requirements (and vice-versa).

**Fix:** Call `recomputeIsTrained(params.id)` after a PATCH that changes `subPosition`/`roleId` (it's a safe no-op for non-trainees).

### H5 — Course completion freezes after content changes → stale certificates
**Data integrity · `maybeAwardCertificate` + lesson/module add/delete routes**

Completion is evaluated only at quiz-pass time, and once a `Certificate` exists it's never revisited. So adding a lesson after a trainee finishes leaves them holding a certificate (and `completed=true`) for a course they haven't finished — while the progress bar simultaneously shows <100%. Deleting the last unfinished lesson makes them "complete" with no certificate until they happen to pass some unrelated quiz.

**Fix:** Recompute completion/certificate for enrolled users on lesson/module add/delete, or compute completion dynamically instead of freezing it into a certificate + flag.

### H6 — Stored-XSS adjacency via unconstrained `video.url`
**Input validation · `src/app/api/lessons/[id]/route.ts:16-19`, rendered in `src/components/lesson-player.tsx:234,309,352,371-377`**

`VideoSchema` accepts `url: z.string().min(1).max(2000)` — **no protocol/host restriction, not bound to the chosen provider**. The instructor-supplied URL flows raw into `<video src>` and `<iframe src>` (including a raw-URL fallback when the provider ID regex misses). Today CSP (`frame-src`/`media-src` allow-lists) blocks `javascript:` and arbitrary hosts, so this isn't live RCE — but the input layer has zero defense, and it shares the blast radius with the `script-src 'unsafe-inline'` weakness (M4).

**Fix:** Validate URL against provider at the schema level — `UPLOAD` must match the uploads path; `YOUTUBE/VIMEO/LOOM` must be `https:` and host-match the provider. Drop the raw-URL fallbacks in the player.

### H7 — `permissions/user` has no scoping or self-protection (latent escalation amplifier)
**Authorization · `src/app/api/permissions/user/route.ts:16-34`, `permissions/role/route.ts:16-30`**

Both require `PERMISSIONS_MANAGE` (super-admin-only by default, so **not exploitable today**), but have no guardrails: the holder can grant **any** override to **any** user — including granting `PERMISSIONS_MANAGE`/`USER_*`/`REPORTS_GLOBAL` to themselves or to users in other centres, and can flip permissions on the `SUPER_ADMIN` role itself. The moment a centre admin is ever granted `PERMISSIONS_MANAGE`, they self-escalate to full admin.

**Fix:** Restrict both routes to `roleType === "SUPER_ADMIN"` (matching the roles/sub-positions routes); forbid actors editing their own permissions and granting admin-tier permissions.

### H8 — Empty quiz / `passThreshold: 0` is an automatic pass
**Data integrity · `quiz/[quizId]/attempt/route.ts:83-85`, review route:60-61**

`autoScore = totalPoints === 0 ? 0 : …`. A quiz with no questions, or any quiz whose `passThreshold` an author sets to `0` (validation allows `min(0)`), passes with score 0 on any submission — completing the lesson and feeding certificate logic without the trainee demonstrating anything.

**Fix:** Treat `totalPoints === 0` as not-passable; enforce `passThreshold >= 1` and at least one question for an active quiz.

---

## 🟡 MEDIUM

### M1 — `bulk-enrol`: no published check, no permission gate, cross-centre via null centre, racy loop
**`src/app/api/courses/[id]/bulk-enrol/route.ts:11-43`** (flagged by both auth and data-integrity dives)

Unlike self-enroll, it never checks `course.published`, so admins can enroll trainees into draft courses. The `allowed` gate passes for **any** CENTRE_ADMIN with no permission check. If the admin's own `centreId` is null, the trainee filter becomes `undefined` → they can enroll **any** user system-wide. The body loops sequential `findUnique`+`create`, which is racy and aborts mid-way with an uncaught `P2002`.

**Fix:** Require `published` for non-author/non-super actors; guard the null-centre filter; replace the loop with `createMany({ skipDuplicates: true })`.

### M2 — CENTRE_ADMIN can act on other admins / super-admins via null-centre match
**`src/app/api/users/[id]/route.ts:27-31`; same pattern in `quiz/unlock` and certificate download**

`authorize` returns true when `session.user.centreId === target.centreId`. Super-admins are seeded with `centreId: null`; a centre admin whose own centre is null satisfies `null === null` and could PATCH/DELETE super-admin accounts. Even normally, a centre admin can edit/deactivate/reset-password other CENTRE_ADMINs and INSTRUCTORs in their centre — broader than the "manage trainees" intent, and `active`/`password` aren't role-gated.

**Fix:** Require both centres non-null and equal; restrict CENTRE_ADMIN targets to `role.type === "TRAINEE"`. Mirror in `quiz/unlock` and certificate download.

### M3 — File upload trusts client `Content-Type` (no magic-byte check)
**`src/app/api/uploads/video/route.ts:24`, `src/lib/storage.ts:10-13`**

Validation relies only on the browser-supplied `file.type`, which is attacker-controlled. Files are written under `public/uploads/videos/<random>.<ext>` and served publicly. Mitigated by server-generated random filenames (no path traversal), `nosniff`, a 500 MB cap, and a 5/min limit — so XSS is contained, but unvalidated bytes are still stored and served as "video."

**Fix:** Sniff magic bytes server-side (`file-type`) and assert MIME before writing; or serve uploads from an isolated origin / the existing S3 path with `Content-Disposition: attachment`.

### M4 — CSP ships `script-src 'unsafe-inline'` in production
**`next.config.js:24`**

`'unsafe-inline'` defeats CSP's core script-XSS protection. The app has no inline-script sinks today (verified), but combined with H6 the margin is thin.

**Fix:** Move to a per-request nonce + `'strict-dynamic'` (Next 14 supports nonce injection via middleware) and drop `'unsafe-inline'` from `script-src`. The YouTube IFrame API script is loaded by host, which survives the migration.

### M5 — `quiz/unlock` deletes ALL attempts, destroying history
**`src/app/api/quiz/unlock/route.ts:27`**

Unlock does `quizAttempt.deleteMany({ where: { userId, quizId } })` — wiping every attempt including passing and review-pending ones, with no audit-log entry.

**Fix:** Set `locked=false` on the locked attempts instead of deleting; add an `audit()` entry.

### M6 — `Course.passThreshold` is collected but never used
**`prisma/schema.prisma:130` vs `:185`; scoring uses only `quiz.passThreshold`**

The course-level threshold is stored from the form but never consulted — admins who change it think they're changing pass criteria and aren't.

**Fix:** Either remove it, or make it the default for quizzes that don't override.

### M7 — Reorder/create can produce duplicate `order` values
**`courses/[id]/reorder/route.ts:24-43`; module/lesson create `order = count(...)`**

A partial reorder payload leaves omitted items at their old `order` → duplicates, and there's no `@@unique([courseId, order])`/`([moduleId, order])`. Duplicate orders make lesson sequencing (and unlock gating) nondeterministic. `order = count()` on create is also racy.

**Fix:** Add unique constraints and/or always reorder the full set server-side; compute `order` as `max+1` inside a transaction.

### M8 — Blank review submission silently fails every open-ended answer
**`src/app/api/quiz/attempt/[id]/review/route.ts:33-81`**

Authorization is correct, but if a reviewer submits empty `grades: {}`, every open-ended question scores 0 and `needsReview` is flipped to false unconditionally — possibly locking the trainee out with no confirmation.

**Fix:** Require an explicit grade for every open-ended question; reject if any are missing.

### M9 — Review vs unlock authorization are scoped inconsistently
**`quiz/attempt/[id]/review/route.ts:36-39` (author-scoped) vs `quiz/unlock` (centre-scoped)**

A centre admin manages trainees but can't review their open-ended attempts; an instructor can review attempts from trainees in centres they otherwise have no relationship with. Consistency gap, not a vuln.

**Fix:** Decide whether review is author- or centre-scoped and apply uniformly.

---

## 🟢 LOW

| # | Finding | Location | Fix |
|---|---|---|---|
| L1 | **CSV formula injection** — `esc()` quote-escapes but doesn't neutralise leading `= + - @`; a user's name/email flows into exports and executes in Excel | `src/lib/csv.ts:4-9` | Prefix risky leading chars with `'` |
| L2 | **Uncaught Prisma errors → 500s leaking internals** — many handlers `throw e` after handling `P2002`; routes without try/catch surface raw Prisma errors on bad FKs | `users/[id]:101,144`, `admin/roles*`, `centres/[id]`, `modules/[id]` | Central error wrapper → generic 500 + server-side log; ensure `NODE_ENV=production` |
| L3 | **CSP `img/media/connect-src` use bare `https:` wildcard**; `images.remotePatterns` is `**` (minor SSRF via image optimizer) | `next.config.js:26,29,30,42` | Pin to actual CDN/storage origins |
| L4 | **CSRF allows missing `Origin`**, and only `assertSameOrigin` routes also require a JSON content-type — protection is uneven across routes | `src/lib/csrf.ts:33`, `middleware.ts:11-14` | Promote content-type enforcement into middleware; fall back to `Sec-Fetch-Site` |
| L5 | **`supervisorId` is not privileged** — a centre admin can set themselves as supervisor of any in-centre user (gaining `/my-team` + cert-download); no self-loop/cycle/onDelete guard | `users/[id]/route.ts:64-87`, `schema.prisma:112` | Treat as super-admin-only or validate same-centre + non-cyclic; add `onDelete: SetNull` |
| L6 | **Certificate serial is only 4 random bytes** (~32 bits) against a UNIQUE column with no retry → birthday collisions throw uncaught 500 | attempt route:166 / review route:127 | Use 12–16 bytes / UUID, or generate-and-retry on `P2002` |
| L7 | **`users` POST doesn't validate `centreId` existence** for super-admin → FK 500 instead of 400 | `src/app/api/users/route.ts:52-62` | Verify centre exists, return 400 |
| L8 | **No centre PATCH route** — centre rename/edit is impossible (see C2) | `src/app/api/centres/[id]/route.ts` | Add PATCH with explicit field allow-listing |

---

## ✅ Verified correctly secured

- **Input validation** — all 32 routes use `parseJson` + zod; no `z.any()`, all strings bounded, no mass assignment (PATCH handlers allow-list fields), client-unsettable fields (`authorId`, role `type`, role/trained/centre) are gated.
- **No injection sinks** — no `$queryRaw`/`$executeRaw`, no `dangerouslySetInnerHTML`, no `eval`; video regexes are ReDoS-safe; reorder re-checks IDs against the course.
- **No secret leakage** — `password` is only ever written as a bcrypt hash (cost 12); `/api/me` returns only safe fields.
- **Login hardening** — bcrypt compare, `active` checked at login, email lowercased, generic `null` on every failure (no enumeration), 5/min per-email limit. Quiz attempts 10/min, uploads 5/min.
- **Trainee data scoping** — progress requires enrollment; quiz answers strip `isCorrect` before reaching the client; grading is server-side; notifications and certificate download are object-scoped; report exports are role-gated and centre-filtered.
- **User-management integrity** — only super-admins set role/centre/trained; centre admins limited to trainees in their own centre; last-super-admin delete + self-delete guarded under a serializable transaction.
- **Data model** — course-content cascade deletes are correct; `Enrollment`/`Certificate` have the right unique constraints; role/sub-position deletes are guarded with 409 + transactional cleanup; sub-position rename is consistent across users + course assignments; seed is idempotent.
- **Headers** — HSTS preload, `X-Frame-Options`, `frame-ancestors 'self'`, `object-src 'none'`, `base-uri`, `form-action`, `nosniff`, `poweredByHeader:false` all present.

---

## ⚙️ Code Quality, Reliability & Performance

The fourth dimension — maintainability, failure behavior, and scale. Items that duplicate the findings above are cross-referenced, not repeated. (The quiz/certificate race was independently confirmed here = **H2/H3**; ordering races = **M7**.)

### Correctness — silent data loss

**CQ-1 (High) — Lesson PATCH erases all quiz questions when `questions` is omitted**
`src/app/api/lessons/[id]/route.ts:59-82` (esp. `:66`). If the body includes a `quiz` object (e.g. an instructor changes only `passThreshold`), the handler unconditionally `deleteMany`s every question, then recreates them only if `body.quiz.questions` is an array. A partial quiz edit **wipes all questions and answers** — and orphans existing `QuizAttempt.answers` (keyed by the deleted question IDs). **Fix:** only touch questions when `body.quiz.questions !== undefined`.

**CQ-2 (High) — Course PATCH wipes role assignments non-transactionally**
`src/app/api/courses/[id]/route.ts:33-40`. `deleteMany` → `createMany` → `update` as three separate awaits; a throw between them leaves the course with **no** role assignments (it vanishes from every trainee's assigned list). No validation that `roleIds` are real. **Fix:** one `$transaction`; validate role IDs first.

**CQ-3 (Medium) — Render-time DB write in a GET page**
`trainee/courses/[courseId]/lessons/[lessonId]/page.tsx:33-37` runs `progress.upsert` during RSC render — a non-idempotent side effect on a GET, no try/catch. **Fix:** move the write to the progress route / a server action.

### Reliability — error handling

**CQ-4 (High) — ~25 routes have no try/catch → raw 500s and wrong status codes**
Most routes outside `users/[id]`, `admin/roles*`, `admin/sub-positions*`. `prisma.update/delete` on a missing id throws **P2025 → 500 instead of 404**; constraint/DB errors are uncaught; error shapes are inconsistent (`unauth` vs `Invalid request`, some with `details`, none with a `code`). **Fix:** a shared `withRoute()` wrapper mapping P2025→404, P2002→409, P2003→400, else→generic 500, with one `{error, code?, details?}` shape.

**CQ-5 (Medium) — Fire-and-forget side effects: half 500 the request, half swallow silently**
Notifications are `await`ed unguarded (`enrollments:36`, `bulk-enrol:46`, `attempt:116-146`) so a notification-write failure 500s an action that already succeeded; meanwhile `enrollment.update({completed}).catch(()=>{})` (`attempt:171`, `review:132`) silently drops completion, leaving a certificate with `completed=false`. **Fix:** make notifications best-effort *with logging* (copy `audit.ts`'s pattern); fold the completion update into the certificate transaction.

### Performance & scale

**CQ-6 (High) — N+1 explosion via `getCourseProgressForUser` called inside `.map()`**
`src/lib/course-progress.ts` issues 2 queries per call and is invoked per-row — sometimes nested — in `my-team/page.tsx:20`, `instructor/courses/[id]/progress/page.tsx:21`, `centre/trainees/[id]/page.tsx:38` (which **already loaded** the progress rows), `trainee/page.tsx:38`, and `reports/centre/export`. Hundreds of trainees → thousands of round-trips; `/my-team` and CSV export will time out at scale. **Fix:** aggregate from already-loaded data; do one `progress.findMany` over all lesson IDs.

**CQ-7 (High) — `admin/reports` loads every enrollment + attempt system-wide into memory**
`admin/reports/page.tsx:6-35` and `reports/admin/export`. No `take`, no DB aggregation — grows with total platform activity and will OOM. The correct `groupBy`/`_count` pattern already exists in `centre/reports`. **Fix:** migrate to DB-side aggregation.

**CQ-8 (Medium) — Missing indexes on hot FK/filter columns**
Only `AuditLog` is indexed. No `@@index` on `Progress(userId)`, `QuizAttempt(userId, quizId)`, `Enrollment(courseId)`, `Notification(userId, read)`, `Course(authorId)`, `User(centreId/roleId/supervisorId)`. Composite-uniques are auto-indexed, but the many non-unique filters sequential-scan as tables grow. **Fix:** add the listed `@@index`es.

**CQ-9 (Medium) — Unbounded `findMany` / no pagination; over-fetching**
Listing pages and exports pull whole tables (`admin/courses`, `admin/permissions` all-users, `centre/trainees`, `my-team`); magic caps (`take:500/200/100`) silently hide overflow with no "next page". Many deep `include`s fetch full relation trees for a `.length` or two fields. **Fix:** real pagination + targeted `select`/`_count`.

**CQ-10 (Medium) — Centre-scoped pages go global when `centreId` is null**
`centre/page.tsx`, `centre/trainees/page.tsx:15`, `centre/reports`, `reports/centre/export` use `centreId ? {centreId} : {}` — a centre admin with a null centre reads/exports **all centres' trainees** (cross-tenant exposure via a null). Read-side complement to **M2**. **Fix:** treat null as "no data," not "all data."

### Testing & CI

**CQ-11 (High) — Money paths untested; no CI**
Tests cover only `rate-limit`, `validate`, `csv`, `csrf`, `users/[id]`. **Untested:** quiz scoring, lockout math, certificate award + `recomputeIsTrained`, manual-review re-scoring, progress/enrollment gating, `userHasPermission` override resolution, `course-progress`. No `.github/` → lint/test/build never run automatically. **Fix:** unit-test the scoring/award/permission helpers (mockable like the existing `users` test); add `ci.yml` running `npm ci && lint && test && build`.

### Low (code quality)

| # | Finding | Location |
|---|---|---|
| CQ-L1 | `maybeAwardCertificate` copy-pasted in two routes (drift risk); the two notifications pages are byte-identical | attempt:152 / review:114 |
| CQ-L2 | Unnecessary `as any` on `session.user` despite full typing in `types/next-auth.d.ts`; `Record<string,unknown>` update objects lose Prisma typing | `auth.ts:41,48,59-63`; `courses/[id]:29`; `users/[id]:84` |
| CQ-L3 | `QuizAttempt.answers` JSON cast to `Record<string,string>` unvalidated on read | `review:47` |
| CQ-L4 | Magic numbers (`70`, `3`, `95%`, `60_000`, `take:` caps) duplicated rather than centralized | courses/lessons routes, `lesson-player.tsx` |
| CQ-L5 | Audit page `toLocaleTimeString()` uses server locale → hydration mismatch | `admin/audit/page.tsx:24` |
| CQ-L6 | Seed uses one weak shared password `Password1!` for all accounts incl. Super Admin — dangerous if ever run against a shared env | `prisma/seed.ts:71` |
| CQ-L7 | `recomputeIsTrained` counts outside a transaction → transiently wrong (self-heals) | `training.ts:31-39` |
| CQ-L8 | `initials`/`formatDate` have no guard for empty/invalid input | `utils.ts:8-19` |

**Done well (code quality):** `users/[id]` is a robust template (serializable tx, P2002/P2034 handling) — the gap is the rest of the app not following it; `audit.ts` logs-but-doesn't-fail (the pattern notifications should copy); `centre/reports` & `_count` usages show the team knows DB aggregation; `types/next-auth.d.ts` properly types sessions; `tsconfig` is `strict`. `npm run test`/`build` should pass; there is just no CI to run them.

---

## Recommended fix order (all four dimensions)

**Tier 1 — correctness & access (do first)**
1. **C1** — `assertCourseOwner()` across all course/module/lesson routes (cross-instructor tampering)
2. **CQ-1** — stop lesson PATCH from wiping quiz questions (silent data loss on a normal edit)
3. **C2 + CQ-2** — guard centre delete + add the missing centre PATCH; make course role-assignment edits transactional
4. **H2 + H3** — serializable transactions for quiz attempts & certificate award (idempotent `upsert`)

**Tier 2 — security hardening**
5. **H1** — re-validate identity/`active` in the JWT callback
6. **H7 + H8 + M1 + M2 + CQ-10** — permission-route lockdown, empty-quiz guard, bulk-enrol + null-centre exposure
7. **H6 + M4** — constrain `video.url`; drop `script-src 'unsafe-inline'`

**Tier 3 — correctness drift & reliability**
8. **H4 + H5** — recompute `isTrained`/completion on the right events
9. **CQ-4 + CQ-5** — shared error wrapper (P2025→404); best-effort notifications + completion inside the cert transaction

**Tier 4 — scale & confidence**
10. **CQ-6 + CQ-7** — kill the N+1s; move reports to DB aggregation
11. **CQ-8 + CQ-9** — add indexes; paginate + `select`
12. **CQ-11** — test the scoring/award/permission paths; add CI
13. Remaining Mediums and Lows as convenient.
