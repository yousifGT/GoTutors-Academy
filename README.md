# GoTutors Academy

A full-stack LMS built with Next.js 14 (App Router), TypeScript, Tailwind, Prisma + PostgreSQL, and NextAuth (JWT sessions). Branded with the GoTutors palette and Poppins.

## Roles

- **Super Admin** — full access, manages all centres, users, courses, permissions, and audit log.
- **Centre Admin** — manages trainees, progress and notifications for their centre only.
- **Instructor** — builds and edits courses, modules, lessons, quizzes; manual-grades open-ended quizzes; sees trainee progress.
- **Trainee** — takes courses, completes quizzes, earns certificates.

Single login at `/login` redirects to the matching dashboard. Any user with `supervisorId`-linked reports also gets a "My team" view.

## Demo accounts (seeded only — change before any real deployment)

| Role         | Email                       |
|--------------|-----------------------------|
| Super Admin  | super@gotutors.test         |
| Centre Admin | centre@gotutors.test        |
| Instructor   | instructor@gotutors.test    |
| Trainee      | trainee@gotutors.test       |

Password for the seeded accounts is `Password1!`. **Rotate or remove the seed before deploying.**

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Copy .env.example to .env and fill in real values.
#    Generate secrets with: openssl rand -hex 32
cp .env.example .env

# 3. Create the schema and seed demo data
npm run db:push
npm run db:seed

# 4. Run the dev server
npm run dev
# → http://localhost:3000
```

## Tests

```bash
npm test         # vitest run (CI)
npm run test:watch
```

## Production deployment checklist

Before deploying to a public URL, complete every box:

- [ ] `DATABASE_URL` points at a managed Postgres with backups (Neon, RDS, Supabase, etc.).
- [ ] `NEXTAUTH_SECRET` is a fresh 32-byte hex value (`openssl rand -hex 32`).
- [ ] `NEXTAUTH_URL` matches the deployed origin (HTTPS).
- [ ] Seed data is **not** loaded in prod (do not run `npm run db:seed` against a prod DB).
- [ ] Demo email accounts (`*@gotutors.test`) are deleted or replaced.
- [ ] `UPLOAD_BACKEND=s3` is set with S3 credentials, and `@aws-sdk/client-s3` is installed:
  ```bash
  npm i @aws-sdk/client-s3
  ```
  Local-disk uploads are dev-only — they will not survive serverless deploys.
- [ ] HTTPS is terminated upstream (the `Strict-Transport-Security` header is sent).
- [ ] Logs and error monitoring are wired (Sentry, Logflare, Datadog, etc.).
- [ ] `npm run build` succeeds in CI and `npm test` passes.

## Security posture

- **Auth**: NextAuth credentials provider, bcrypt-hashed passwords, JWT sessions, role-based middleware (`src/middleware.ts`). Sign-in attempts are rate-limited (5 / minute / email).
- **CSRF**: every mutating `/api` request is origin-checked in middleware (`src/middleware.ts`) — cross-site requests are rejected by `Origin`/host mismatch. JSON-only routes additionally enforce an `application/json` content-type (`src/lib/csrf.ts`).
- **Rate limiting**: In-memory sliding window for sign-in, quiz attempts, and uploads (`src/lib/rate-limit.ts`). **Replace with Redis for multi-instance deployments.**
- **Permissions**: role-level matrix + per-user overrides at `/admin/permissions`. Enforced via `userHasPermission()` server-side on every privileged API.
- **Headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy and Permissions-Policy on every response (`next.config.js`).
- **Audit**: Every permission change is logged to the `AuditLog` table, viewable at `/admin/audit`.
- **Uploads**: MIME-type allowlist and 500 MB cap (`src/app/api/uploads/video/route.ts`).
- **Open-ended quizzes**: answers that don't exactly match an accepted answer are flagged for manual instructor review — no false fails, no automatic lockout.

## Features

- **Course player**: video must be fully watched before the quiz unlocks; quiz must be passed before the next lesson unlocks. YouTube and Vimeo embeds use the IFrame/Player.js API to track real playback. Loom falls back to attestation.
- **Quizzes**: multiple choice + open-ended; configurable pass threshold and retry limit (default 3). Open-ended answers route to the instructor review queue at `/instructor/review`.
- **Certificates**: auto-issued on full course completion. PDF via `@react-pdf/renderer`. Visible to the trainee, their supervisor, their centre admin and super admin.
- **Notifications**: per-user feed for centre admins and instructors. Triggered by enrol, pass, fail, retry-unlock-needed events. Centre-scoped.
- **Centre admin**: trainee list with search, per-trainee detail with per-lesson progress, unlock retries, CSV export of centre progress.
- **Super admin**: centres, users, courses, global reports + CSV export, permissions matrix, audit log.
- **Supervisor**: `/my-team` shows reports' progress and certificates for any user with at least one report.
- **Instructor**: course CRUD, module + lesson reordering, direct video upload (local or S3), course duplication, bulk enrol matching candidates, review queue badge in sidebar.
- **Theme**: light/dark toggle with `next-themes`; full GoTutors palette mapped to Tailwind.
- **Font**: Poppins via `next/font/google`.

## Notable code paths

| Area                          | Path                                                                  |
|-------------------------------|-----------------------------------------------------------------------|
| Prisma schema                 | `prisma/schema.prisma`                                                |
| Seed                          | `prisma/seed.ts`                                                      |
| NextAuth config               | `src/lib/auth.ts`                                                     |
| Permissions library           | `src/lib/permissions.ts`                                              |
| Middleware (route guards)     | `src/middleware.ts`                                                   |
| CSRF guard                    | `src/lib/csrf.ts`                                                     |
| Rate limiter                  | `src/lib/rate-limit.ts`                                               |
| Storage backend               | `src/lib/storage.ts`                                                  |
| Audit log helper              | `src/lib/audit.ts`                                                    |
| Course player + quiz          | `src/components/lesson-player.tsx`                                    |
| Quiz submission               | `src/app/api/quiz/[quizId]/attempt/route.ts`                          |
| Manual grading                | `src/app/instructor/review/page.tsx`, `src/app/api/quiz/attempt/[id]/review/route.ts` |
| Certificate PDF               | `src/lib/certificate-pdf.ts`                                          |
| Permissions matrix UI         | `src/app/admin/permissions/page.tsx`                                  |
| Audit log viewer              | `src/app/admin/audit/page.tsx`                                        |
| Supervisor team view          | `src/app/my-team/`                                                    |
| CSV exports                   | `src/app/api/reports/centre/export/route.ts`, `src/app/api/reports/admin/export/route.ts` |
