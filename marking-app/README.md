# Marker

AI marking for tutoring centres. Photograph a student's paper, get it marked
against your own mark scheme, and hand back feedback in the same lesson.

This is a standalone application — its own database, its own accounts, its own
deployment. It shares nothing with any other system.

## Two ways to mark

**Quick marking** — a pile of papers, one mark scheme, no filing. Photograph
them one after another, each labelled with whatever is written on the top of the
page, and mark the lot in one pass. At the end you are asked, per paper, whether
to store the result against a child, create that child there and then, or not
keep it at all. Anything you leave undecided waits under **Not stored yet**
rather than being auto-filed against a guess or quietly deleted.

**Mark for a student** — pick the child first and the result goes straight onto
their record.

Either way you can export: one paper as a PDF for a parent, a whole quick-marking
session as a single PDF, or a child's full history as a spreadsheet.

## What it does

- **Photograph and mark.** A tutor photographs a paper on a phone. The marking
  engine reads the handwriting, marks each question against the mark scheme, and
  returns a mark, a comment, and how confident it is.
- **Every child has an admission number.** It is the centre's own reference,
  unique within the centre, and it is how staff find a student again — search by
  it or by name. An exact number match is ranked above a partial one, so
  searching "GT-1" finds the child numbered GT-1, not GT-100.
- **A human marks what it can't.** Anything illegible, low-confidence, skipped,
  or out of range goes to a review queue instead of being guessed. That is the
  central design decision: a confidently wrong mark on a child's work is worse
  than no mark at all.
- **It learns from your markers.** Every mark a person checks or corrects is
  kept as a worked example and shown to the engine the next time it marks that
  question. There is no training run and no fine-tuning — it converges on how
  *your* centre marks, question by question.
- **It says how the student did.** Every paper gets a score, a band, what went
  well, and what to work on — written to the student, not about them.
- **It tracks a child over time.** Per-student history, average, trend, and the
  questions that keep costing them marks.

## Running it locally

```bash
docker compose up -d          # Postgres on port 5434
cp .env.example .env          # then fill in the values below
npx prisma db push            # create the tables
npm run dev                   # http://localhost:3100
```

On first visit you will be sent to `/setup`, which creates your centre and its
first admin. That page works exactly once — the moment an account exists, it and
the route behind it refuse.

For a populated database instead:

```bash
npm run db:seed               # admin@demo.test / MarkerDemo123
```

### Configuration

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. |
| `NEXTAUTH_SECRET` | yes | Signs session cookies. `openssl rand -hex 32`. |
| `NEXTAUTH_URL` | yes | The address people use. No trailing slash. |
| `ANTHROPIC_API_KEY` | no | Turns automatic marking on. Without it the app runs and every paper goes to the human queue — the dashboard says so. |
| `UPLOAD_BACKEND` | in production | Set to `s3` for durable page storage. Without it, uploads are refused in production. |
| `S3_*` | with `UPLOAD_BACKEND=s3` | `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and optionally `S3_ENDPOINT` (R2, MinIO) and `S3_PUBLIC_URL_BASE`. Needs `npm i @aws-sdk/client-s3`. |

`GET /api/health` reports every configuration problem at once, plus warnings for
things that are merely off rather than broken.

## Commands

```bash
npm run dev          # http://localhost:3100
npm run build        # production build
npm test             # 121 unit tests
npm run typecheck    # tsc --noEmit
npm run e2e          # drives a real browser through quick marking (needs playwright)
npm run db:push      # apply prisma/schema.prisma
npm run db:seed      # demo centre, people, students and a mark scheme
npm run db:studio    # browse the database
```

## How marking works

1. **Mark schemes are yours.** Each question has a label, the question as
   printed, the expected answer, how many marks it is worth, and — the field
   that matters most — guidance on awarding part marks. Marking quality tracks
   the guidance more than anything else.
2. **The engine reads the photographs** (`src/lib/marking/marker.ts`) with
   Claude, and returns per-question marks as structured JSON.
3. **Its answer is then checked** (`src/lib/marking/scoring.ts`). The
   denominator always comes from the mark scheme, never from the model; the
   numerator is clamped into it; and anything illegible, low-confidence,
   out of range, part-marked, or missing is flagged. A question the model
   skipped becomes a zero that needs a human — it never quietly disappears
   from the total.
4. **Flagged papers go to `/queue`** with the reason attached.
5. **A person marks or corrects them** at the bottom of the paper's page. That
   review writes `MarkingExample` rows.
6. **Those examples are replayed** into the prompt next time
   (`src/lib/marking/examples.ts`), corrections before confirmations, recent
   before old, and spread across the mark range so four full-mark examples don't
   teach the engine to award full marks.

### Cost

One paper is one request: the page images, the mark scheme, and its worked
examples. The scheme and examples are identical for every paper marked against
that scheme and sit before the per-paper instruction, so a class set reuses the
cached prefix. The model is set in `src/lib/marking/marker.ts`.

## Who can see what

Two rules, in this order:

1. **Nothing crosses an organisation.** Every query filters on the viewer's own
   `organisationId`. `src/lib/marking/access.ts` is the only place this is
   decided, and it is unit tested.
2. **Inside a centre**, an `ADMIN` sees everything and manages the team; a
   `MARKER` sees their own students and their own uploads. Whoever photographed
   a paper can always mark it by hand — the human fallback must never depend on
   a permission the person standing next to the child might not have.

The same rules cover papers that are not filed against anyone yet: a
quick-marked paper belongs to whoever photographed it until it is stored.

## Deploying

`Dockerfile` builds a standalone image with a health check:

```bash
docker build --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) -t marker .
docker run -p 3100:3100 --env-file .env marker
```

Set `UPLOAD_BACKEND=s3` before marking real work. Without durable storage the
app refuses uploads in production rather than writing to a container filesystem
that the next deploy wipes — a photographed paper cannot be recovered inside the
product, because the test went home in a school bag.

## Known limits

- **Whole marks only.** The mark columns are integers, so half marks are not
  supported. A scheme that needs them has to be written as whole marks.
- **No migrations.** `prisma db push` against the database, no `migrations/`
  directory. Take a snapshot before a schema change.
- **Rate limiting is per container**, held in an in-process Map. More than one
  container means moving it to Redis.
- **HEIC photos are rejected.** iPhones can be set to "Most Compatible" to shoot
  JPEG; otherwise the photo needs converting first.
- **Marking is synchronous.** The request holds open for the length of the
  marking call (up to 300s), and quick marking runs its papers one after
  another. A background queue is the next thing to build if a centre routinely
  marks class sets in one go.
- **Reports are only exported from finished papers.** A paper that still needs a
  person to check it has a score, but part of that score is a mark nobody
  trusts — the export is refused until someone has been through it.
