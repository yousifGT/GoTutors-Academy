# GoTutors Inspection Platform — Backend Handoff (v13, for AWS)

*For the developer building the hosted version on AWS. The single-file app
(`centre-inspection-app_8.html`) is the working prototype and the definitive spec
for screens, ordering and branding. This document, `inspection-core.js` and
`gotutors-seed.json` are what you need to build the server-backed version
faithfully.*

---

## 0. What's in this handoff

| File | What it is |
|---|---|
| `centre-inspection-app_8.html` | The working prototype. Reference for every screen, the inspection flow, and the GoTutors branding. Open it in a browser to see the exact intended behaviour. |
| `inspection-core.js` | All scoring / bucketing / critical-override / note & photo rules, framework-agnostic and dependency-free. Import on the server (Node) **and** the new front end so both share one source of truth. |
| `gotutors-seed.json` | The exact current checklist + centres, in the app's export shape: `{ config:{ checklistVersion, configVersion, passcode, centres, template }, inspections:[] }`. Use `config` as seed data. |

**Changed since the first handoff** (checklist is now v13): centre **size**
(small/medium/large) captured per inspection; four new sections (**Book & Homework
Check**, **Teaching Observation — Maths / English / Science**); **per-tutor tagging**
on note entries; **photo-exempt** critical items; **size-based minimum** flagging on
number questions; and **active-time** tracking (the timer pauses when the inspector
leaves the inspection). All of this is reflected in `inspection-core.js` and the
schema below.

---

## 1. What transfers, and what doesn't

**Reuse as-is**
- `inspection-core.js` — scoring, bucketing, critical-override, note/photo rules,
  size-based flagging and guideline resolution. Tested; dependency-free.
- The **checklist content** — from `gotutors-seed.json` (`config.template`).
- The **centre list** — `config.centres` (note: names no longer carry a "GoTutors"
  prefix; the brand lives on the logo/headers).
- The **UI flows, ordering and design** — the current app is the spec. Branding:
  navy `#1C1960`, sky `#57B9EA`, Poppins font, the embedded GoTutors logo.

**Rewrite**
- DOM rendering and the `window.storage` calls become framework components and API
  calls. Don't port them line-by-line.

---

## 2. Data model (PostgreSQL on RDS / Aurora)

Store photos and signatures in **S3**, not the database — keep only their URLs here.
New/changed columns versus the first handoff are marked `-- NEW`.

```sql
create table profiles (
  id           uuid primary key,              -- = auth user id (Cognito / your IdP)
  full_name    text,
  role         text not null default 'inspector'
               check (role in ('super_admin','head_office','regional_manager','franchisee','inspector','read_only')),
  created_at   timestamptz default now()
);

create table centres (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  status     text default 'open',
  size       text check (size in ('small','medium','large')),  -- NEW default centre size (overridable per inspection)
  sort_order int default 0
);

create table templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  version    int  not null default 1,
  is_active  boolean default true,
  created_at timestamptz default now()
);

create table sections (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid references templates(id) on delete cascade,
  title       text not null,
  sort_order  int  not null
);

create table questions (
  id            uuid primary key default gen_random_uuid(),
  section_id    uuid references sections(id) on delete cascade,
  text          text not null,
  type          text not null default 'rating'
                check (type in ('rating','yesno','scale','number','choice')),
  sort_order    int  not null,
  options       jsonb,          -- for choice
  min_val       int,            -- for scale
  max_val       int,            -- for scale
  unit          text,           -- for number
  scored        boolean default false,   -- scored multiple-choice (1st option best)
  require_note  boolean default false,
  critical      boolean default false,
  photo_exempt  boolean default false,   -- NEW critical item that needs a note, not a photo
  allow_na      boolean default false,
  who_field     boolean default false,   -- NEW attach a tutor name to each note entry
  guide         text,
  dos           jsonb,          -- NEW green "do" bullet list
  donts         jsonb,          -- NEW red "don't" bullet list
  size_guide    jsonb,          -- NEW { small:{text}, medium:{text}, large:{text} }
  min_by_size   jsonb,          -- NEW { small:int, medium:int, large:int } — below target => "improve"
  tally_key     text            -- 'standups' | 'distractions' | null
);

create table inspections (
  id           uuid primary key default gen_random_uuid(),
  centre_id    uuid references centres(id),
  template_id  uuid references templates(id),
  inspector_id uuid references profiles(id),
  size         text check (size in ('small','medium','large')),  -- NEW size used for THIS inspection
  date         date not null,
  started_at   timestamptz,
  ended_at     timestamptz,
  active_ms    bigint,          -- NEW accumulated ACTIVE time (timer pauses when inspector leaves)
  status       text default 'draft' check (status in ('draft','submitted')),
  score_pct    int,
  verdict      text,
  targets      text,
  -- debrief
  debrief_role     text,
  debrief_name     text,
  debrief_notes    text,
  debrief_feedback text,
  debrief_email    text,
  debrief_signature_url text,
  created_at   timestamptz default now()
);

create table answers (
  id             uuid primary key default gen_random_uuid(),
  inspection_id  uuid references inspections(id) on delete cascade,
  question_id    uuid references questions(id),
  question_text  text,          -- denormalised snapshot (questions may change later)
  answer         text,          -- "pass"/"yes"/"3"/"7"/"Positive"/"na"/null
  score_fraction numeric,       -- from core.itemScore, for analytics
  bucket         text           -- "well" | "improve" | "obs" | "skip"  (compute with size!)
);

-- Layered notes; each entry can carry a tutor name (who) and its own photos.
create table answer_entries (
  id         uuid primary key default gen_random_uuid(),
  answer_id  uuid references answers(id) on delete cascade,
  note       text,
  who        text,              -- NEW tutor name for who_field questions (e.g. subject observations)
  sort_order int default 0
);

create table entry_photos (
  id        uuid primary key default gen_random_uuid(),
  entry_id  uuid references answer_entries(id) on delete cascade,
  url       text not null,      -- S3 URL
  taken_at  timestamptz default now()
);

create index on inspections (centre_id, date desc);
create index on answers (inspection_id);
create index on answers (question_text) where bucket = 'improve';  -- "common issues" queries
```

**Important:** `bucket` and `score_fraction` must be computed with
`inspection-core.js` passing the inspection's `size`, because number questions with
`min_by_size` (currently the toilet-pass count) resolve their bucket from the size.
Don't compute buckets without it.

Enforce roles with row-level security / IAM-scoped access at the data layer
(inspectors write their own; regional managers read their centres; head office reads
all). Do not rely on UI hiding.

---

## 3. API surface (how the app's storage maps to endpoints)

| App operation (prototype) | Endpoint (hosted) |
|---|---|
| load `app-config` | `GET /template/active`, `GET /centres` |
| save config (Management edits) | `PUT /template`, `POST/PUT/DELETE /centres` |
| `insp:<id>` write on Save | `POST /inspections`, `PUT /inspections/:id` |
| `inspections-index` list | `GET /inspections?centre=&from=&to=` |
| open a saved inspection | `GET /inspections/:id` |
| photo capture (data URL) | `POST /uploads` → returns S3 URL |
| `draft` auto-save | `PUT /inspections/:id` with `status='draft'` (autosave) |
| export / CSV | `GET /inspections/export?format=csv\|json` |
| the mailto pre-fill | `POST /inspections/:id/email` → server sends PDF + logs delivery |
| centre summary screen | `GET /dashboard/centres` (server aggregates) |

Server responsibilities the file can't do: generate the PDF, **send the report email
and record delivery**, run dashboard aggregations across all centres, and enforce
auth.

Notes for the hosted build:
- **Active time.** The prototype tracks active milliseconds and pauses when the
  inspector leaves the inspection or backgrounds the tab. Persist `active_ms` and
  checkpoint it on every autosave so a dropped connection doesn't lose time and
  doesn't count time-away. `started_at`/`ended_at` remain wall-clock stamps for
  display; duration = `active_ms`.
- **Drafts / resume.** Autosave should behave like the prototype's draft: an
  interrupted inspection is fully resumable, including which section, all answers,
  photos, the debrief and the paused timer.
- **Per-tutor observations.** The three Teaching Observation sections tag each note
  entry with a tutor (`answer_entries.who`); a single question can hold several
  entries (one per tutor/table). Preserve this in the API and PDF.

---

## 4. Seeding & migration

1. Take `gotutors-seed.json` (already exported for you).
2. Insert `config.template` → `templates` / `sections` / `questions`. All the flags
   map 1:1 to the columns above (including `photo_exempt`, `who_field`, `dos`,
   `donts`, `size_guide`, `min_by_size`).
3. Insert `config.centres` → `centres`.
4. There are no historical inspections in this seed (`inspections: []`). When real
   data exists, export a fresh backup from a device and import each record into
   `inspections` + `answers` + `answer_entries` + `entry_photos` (upload embedded
   photo data-URLs to S3 first, store the returned URLs).
5. Recompute `score_fraction` / `bucket` per answer with `inspection-core.js`,
   passing each inspection's `size`.

Run the prototype and the hosted version in parallel; cut over per centre.

---

## 5. Security (must-haves before real data)

- **UK/EU region** for RDS/Aurora and S3 (set at creation; region can't change later).
- Encryption in transit and at rest; least-privilege IAM; RLS/authorization per role.
- Photos may include children — retention policy + a **DPIA** reviewed by a
  data-protection professional before go-live. Note the checklist deliberately tells
  inspectors **not** to photograph DBS records; keep that constraint server-side too.
- Audit log of access and changes.

*(Not legal advice — confirm the data-protection specifics professionally.)*

---

## 6. Suggested AWS stack

- **Front end:** Next.js or the framework of your choice on Amplify/CloudFront; reuse
  `inspection-core.js` unchanged.
- **API:** API Gateway + Lambda (or ECS/Fargate) in a UK/EU region.
- **DB:** RDS PostgreSQL or Aurora Serverless v2.
- **Auth:** Cognito (map to the `role` on `profiles`).
- **Storage:** S3 (photos + signatures) with signed URLs.
- **Email:** SES for the report PDF, with delivery logging.
- `inspection-core.js` runs identically in Lambda (Node) and the browser.

---

## 7. Checklist shape (quick reference)

15 sections, 101 questions in this seed. Section order (this is the intended
inspector flow — keep it):

1. Pre-Session — Staff Check
2. Session Start — Organisation & Arrivals
3. Classroom Operations
4. Teaching & Learning
5. Book & Homework Check
6. Teaching Observation — Maths
7. Teaching Observation — English
8. Teaching Observation — Science
9. Centre Operations — Systems & Admin
10. Centre Operations — Stock Levels
11. Safeguarding & Welfare
12. Health, Safety & Premises
13. Hygiene & Facilities (Toilets)
14. Student & Parent Voice
15. Wrap-up & Session Tally

Sections 5–8 are the classroom/teaching checks; the three subject sections are all
present at once because an inspector circulates between Maths/English/Science tables
over the two-hour session and tags each observation to the tutor/table it came from.
