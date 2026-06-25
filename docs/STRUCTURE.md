# GoTutors Academy — Application Structure

A Next.js 14 (App Router) learning-management system. TypeScript, Prisma + PostgreSQL,
NextAuth (JWT sessions), Tailwind. Four roles, role-based dashboards, granular permissions.

---

## 1. Database (21 models)

### People & access
| Model | Purpose |
|---|---|
| `User` | email, bcrypt password (cost 12), name, position/sub-position, `isTrained`, `active`, `lastLoginAt`; FKs to centre, role, supervisor |
| `Centre` | a physical location; users belong to one |
| `Role` | a named role mapped to one of 4 **base types**; holds permissions + sub-positions |
| `SubPosition` | job titles under a role (e.g. "Maths Tutor") |
| `Permission` | the 15 permission definitions |
| `RolePermission` | which permissions a role has by default |
| `UserPermissionOverride` | per-user allow/deny that beats the role default |

### Learning content
| Model | Purpose |
|---|---|
| `Course` | title, description, author, passThreshold, published |
| `CourseRoleAssignment` | targets a course at a role + optional sub-position (drives auto-availability) |
| `Module` → `Lesson` | ordered course structure |
| `Video` | one per lesson (UPLOAD / YOUTUBE / VIMEO / LOOM) |
| `Quiz` → `Question` → `Answer` | passThreshold, retryLimit; MULTIPLE_CHOICE or OPEN_ENDED |

### Activity & records
| Model | Purpose |
|---|---|
| `Enrollment` | who's on what course; completed flag |
| `Progress` | per-lesson: videoWatched, quizPassed, timeSpent |
| `QuizAttempt` | score, passed, locked, needsReview, review fields, answers (JSON) |
| `Certificate` | issued on full completion; unique serial |
| `Notification` | trainee enrolled/passed/failed, retry-unlock needed |
| `AuditLog` | actor, action, target, metadata |

---

## 2. Permission system

**15 permissions:**

| Group | Permissions |
|---|---|
| Courses | create · edit · delete · view_all |
| Users | create · edit · delete · view_all · view_centre |
| Centres | manage |
| Quiz | unlock_retry |
| Permissions | manage |
| Reports | global · centre |
| Notifications | view |

**Resolution order** (`userHasPermission`): a per-user override wins if present (Allow/Deny) → otherwise the role's default → otherwise denied.

**Defaults by role:**
- **SUPER_ADMIN** → all 15
- **CENTRE_ADMIN** → user create/edit/delete, view_centre, quiz unlock_retry, reports.centre, notifications
- **INSTRUCTOR** → course create/edit/delete/view_all, notifications
- **TRAINEE** → none

---

## 3. 🔴 SUPER_ADMIN — `/admin`

Full control; can also enter every other section.

| Page | What it does |
|---|---|
| **Dashboard** `/admin` | 4 stat cards: Centres · Users · Courses · Certificates issued (system-wide) |
| **Centres** `/admin/centres` | Create / edit / remove centres; each shows user count |
| **Users** `/admin/users` | Every user across all centres; search by name/email/role/centre/position/sub-position (max 500). Add/edit/activate/deactivate. Can create **any** role |
| **Courses** `/admin/courses` | View every course in the system |
| **Roles & Sub-positions** `/admin/roles` | Create/rename/delete **custom roles** (mapped to a permanent base type that fixes routing + defaults). Manage sub-positions per role — renaming cascades to users + courses; delete blocked if users assigned |
| **Reports** `/admin/reports` | Per-centre table: Centre · Users · Enrolments · Completed · Pass rate · Passes · Fails + Download CSV |
| **Permissions** `/admin/permissions` | **By role** tab: matrix of 15 permissions × roles (checkbox toggle). **User overrides** tab: per-user × permission dropdown (Inherit / Allow / Deny) |
| **Audit log** `/admin/audit` | Last 200 events: When · Actor · Action · Target · Details |

---

## 4. 🟠 CENTRE_ADMIN — `/centre`

Everything scoped to **their own centre**.

| Page | What it does |
|---|---|
| **Dashboard** `/centre` | Centre overview |
| **Trainees** `/centre/trainees` | Trainees in their centre only; searchable. Columns: Name · Sub-position · Trained · Enrolments · Last login · Status (Locked quiz / Active / Inactive). **Add trainee** (trainees only) |
| **Trainee detail** `/centre/trainees/[id]` | Profile, course progress (expandable → per-lesson video/quiz ticks + time spent), locked quizzes with **Unlock** button, certificates with download |
| **Reports** `/centre/reports` | 4 cards scoped to centre: Trainees · Pass rate · Total passes · Total fails. Enrolments-by-course table. Download CSV (centre only) |
| **Notifications** `/centre/notifications` | Feed with unread badge |
| **My team** `/my-team` | Only if they supervise direct reports |

**Cannot:** touch other centres, change roles, manage permissions, see global data, or create non-trainee accounts.

---

## 5. 🟡 INSTRUCTOR — `/instructor`

| Page | What it does |
|---|---|
| **Dashboard** `/instructor` | Instructor overview |
| **Courses** `/instructor/courses` | Their authored courses (super admin sees all). Cards show role/sub-position assignment badges, module + enrolment counts. New course → modules → lessons → video + quiz. Enrol / bulk-enrol trainees |
| **Review queue** `/instructor/review` | Open-ended quiz answers awaiting **manual grade** — only for courses they authored. Grade pass/fail per answer (badge counts pending) |
| **Trainee progress** `/instructor/progress` | Enrolments on their courses: Trainee · Course · Progress bar · Status |
| **Notifications** `/instructor/notifications` | Feed with unread badge |
| **My team** `/my-team` | Only if they supervise direct reports |

**Cannot:** manage users, centres, permissions, or reports.

---

## 6. 🟢 TRAINEE — `/trainee`

No management permissions — the learner experience.

| Page | What it does |
|---|---|
| **Dashboard** `/trainee` | 3 cards: Enrolled courses · Certificates · Available to you. My courses (with progress). Available for your position — courses matched to role + sub-position, self-enrol |
| **My Courses** `/trainee/courses` | Per course: watch lesson **video** → unlocks **quiz** → passing records progress. MC auto-graded; open-ended → instructor review. Retries limited (default 3); hitting the limit **locks** the quiz until an admin unlocks |
| **Certificates** `/trainee/certificates` | Auto-issued (unique serial) when all lessons complete; downloadable |
| **My team** `/my-team` | Only if they supervise others (e.g. a "Head of Centre" trainee) |

---

## 7. My Team — `/my-team` (cross-role)

Available to **any** user with direct reports (`supervisorId`):
- **My team** — reports' progress
- **Team certificates** — reports' earned certificates

---

## 8. Access control — 4 enforced layers

1. **Middleware** (`src/middleware.ts`) — redirects by URL prefix per base type; CSRF same-origin check on every mutating API call
2. **`requireRole()`** (`src/lib/session.ts`) — server-side gate in each section's layout
3. **`userHasPermission()`** (`src/lib/permissions.ts`) — granular check inside API handlers
4. **Per-user overrides** — Allow/Deny that beats the role default for one person

---

## 9. Key directories

```
src/
  app/
    admin/        SUPER_ADMIN pages
    centre/       CENTRE_ADMIN pages
    instructor/   INSTRUCTOR pages
    trainee/      TRAINEE pages
    my-team/      supervisor view (cross-role)
    api/          33 route handlers
    login/        sign-in
  components/     dashboard shell, editors, matrices, players
  lib/            auth, session, prisma, permissions, validate, csrf, audit, notify, training
prisma/
  schema.prisma  data model
  seed.ts        demo data (4 role accounts, sample course)
```
