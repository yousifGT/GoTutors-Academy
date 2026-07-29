# Deploying GoTutors Academy to AWS

A complete, step-by-step path from `localhost` to a production AWS setup.

**Target architecture** (managed services, minimal ops):

```
Users ──HTTPS──> App Runner (Next.js container, auto-scaling, TLS built in)
                      │
                      ├──> RDS PostgreSQL  (database)
                      └──> S3 bucket       (uploaded lesson videos)
Route 53 (your domain)  ·  ECR (container images)  ·  CloudWatch (logs)
```

Rough monthly cost at small scale: RDS `db.t4g.micro` ~£12, App Runner (1 vCPU/2 GB, low traffic) ~£20–30, S3 + data transfer a few pounds. Scale both up later without re-architecting.

---

## 0. Prerequisites (once)

1. An AWS account with billing enabled. Create a **budget alert** first: Console → Billing → Budgets → e.g. £60/month.
2. Install the **AWS CLI v2** and **Docker Desktop** on your machine.
3. Create an IAM user for yourself (Console → IAM → Users → Create) with `AdministratorAccess`, generate an **access key**, then:
   ```
   aws configure
   # paste key + secret, region: eu-west-2 (London), output: json
   ```
   Everything below assumes region **eu-west-2** — keep it consistent.

---

## 1. Database — RDS PostgreSQL

1. Console → **RDS → Create database**:
   - Standard create → **PostgreSQL** (v16).
   - Template: **Free tier** (or Production later).
   - DB instance identifier: `gotutors-db`.
   - Master username: `gotutors`, master password: generate a strong one and save it.
   - Instance: `db.t4g.micro`. Storage: 20 GB gp3, enable storage autoscaling.
   - Connectivity: **Public access: Yes** *for now* (simplest for setup; we lock it down in step 7).
   - Create a new security group `gotutors-db-sg`.
2. After it's available, open the DB's **security group → Inbound rules**:
   - Add rule: PostgreSQL (5432), Source: **My IP** (so you can run migrations from your machine).
3. Note the **endpoint** (e.g. `gotutors-db.xxxx.eu-west-2.rds.amazonaws.com`). Your production connection string:
   ```
   DATABASE_URL="postgresql://gotutors:YOUR_PASSWORD@gotutors-db.xxxx.eu-west-2.rds.amazonaws.com:5432/postgres?schema=academy&sslmode=require"
   ```
   The `schema=academy` is deliberate: Academy's tables live in their own
   PostgreSQL schema rather than `public`, so a second app can later share this
   instance in its own schema (`platform`, `app2`, …) without its migrations
   touching Academy's tables — while cross-schema reporting queries still work,
   because it is all one database. Choosing this now costs nothing; changing it
   later is a data migration.
4. Create the schema from your machine (Windows cmd, in the project folder):
   ```
   set "DATABASE_URL=postgresql://gotutors:YOUR_PASSWORD@...:5432/postgres?schema=academy&sslmode=require"
   npx prisma db push
   ```
   In **PowerShell** (prompt starts with `PS`) that `set` line does nothing useful —
   `set` is an alias for `Set-Variable` there, which Prisma won't see. Use instead:
   ```
   $env:DATABASE_URL="postgresql://gotutors:YOUR_PASSWORD@...:5432/postgres?schema=academy&sslmode=require"
   ```
   `&` inside double quotes is safe in PowerShell, so no escaping is needed. Or type
   `cmd` first to get a Command Prompt and use the `set` form as written.

   **The quotes around the whole `NAME=VALUE` are required, not cosmetic.** `&` is a
   command separator in cmd, so the unquoted form silently truncates the URL at
   `?schema=academy` and then tries to run `sslmode=require` as a command. Two more
   cmd notes: `set` lasts only for that window, so run the `npx` commands in the
   same one; and if the master password contains URL-special characters they must
   be percent-encoded (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`) or the
   connection string parses wrong. Generating a password without those characters
   avoids the problem entirely.

   A common failure here is `P1001: Can't reach database server`. That is
   networking, not Prisma: either the instance is not publicly accessible, or
   `gotutors-db-sg` has no inbound PostgreSQL rule for **your current** IP — and a
   rule pinned to an old address looks correct while blocking you, so re-select
   **My IP** after changing network or location. Check the path before retrying:
   ```
   powershell -Command "Test-NetConnection YOUR-ENDPOINT -Port 5432"
   ```
   Also note `echo %DATABASE_URL%` is a misleading way to verify the variable: cmd
   expands it before parsing the line, so the `&` in the URL splits the command and
   the output looks truncated even when the variable is correct. Use `set DATABASE_URL`
   (no `%` signs) instead.
5. **Create the first Super Admin.** A fresh database has no accounts, and the app
   has no way to create the first one through the UI — creating users requires
   being signed in. Do **not** run `prisma/seed.ts` here: that is for fresh
   development installs and it writes demo centres, courses and `*@gotutors.test`
   logins. Instead, with `DATABASE_URL` still pointing at RDS:
   ```
   npm run db:create-admin
   ```
   It prompts for email, full name and a password (the password is not echoed, so
   it stays out of shell history and screenshots), writes the permission
   catalogue, the four roles with their default grants and the trainee
   sub-positions, and creates exactly one Super Admin — no demo data. For an
   unattended run, set `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PASSWORD` instead.
   Re-running leaves an existing account untouched; `npm run db:create-admin -- --force`
   resets its name and password. Sign in at `/login`, then build the real centres,
   courses and users from `/admin`.
6. **Migrating your existing local data** instead of starting empty (optional):
   ```
   pg_dump --no-owner --no-privileges -d "postgresql://postgres:postgres@localhost:5433/gotutors" -f gotutors.sql
   psql "postgresql://gotutors:YOUR_PASSWORD@...:5432/postgres?sslmode=require" -f gotutors.sql
   ```
   (Install PostgreSQL client tools on Windows if `pg_dump` is missing.)
   Local port is **5433** — `docker-compose.yml` maps `5433:5432` on purpose so the
   dev database never collides with anything else on 5432. Start it first with
   `docker compose up -d`.

   ⚠️ **The schemas differ.** The local dev database keeps Academy in `public`,
   while RDS uses `academy` (step 1.3). `pg_dump` schema-qualifies every statement,
   so the restore above would recreate the tables in `public` on RDS and the app —
   reading `academy` — would see an empty database. Remap the dump before restoring:
   ```
   pg_dump --no-owner --no-privileges --schema=public -d "postgresql://postgres:postgres@localhost:5433/gotutors" -f gotutors.sql
   ```
   then replace `public.` with `academy.` and `SET search_path = public` with
   `SET search_path = academy` in `gotutors.sql` before running `psql`. Verify with
   `SELECT count(*) FROM academy."User";` afterwards. Note this also brings across
   the demo `*@gotutors.test` accounts, which the step 7 checklist has you delete.

---

## 2. Video storage — S3

The app already supports S3 uploads natively (`src/lib/storage.ts`); you just switch it on.

1. Console → **S3 → Create bucket**: name `gotutors-videos-<something-unique>`, region eu-west-2, **Block all public access: ON** (videos are streamed through the app, not public URLs — check how your `S3_PUBLIC_URL_BASE` is used; if you serve directly from S3, use CloudFront in step 8 instead of opening the bucket).
2. Console → **IAM → Policies → Create policy** (JSON), least privilege for the app:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
       "Resource": "arn:aws:s3:::gotutors-videos-<name>/*"
     }]
   }
   ```
3. IAM → **Users → Create user** `gotutors-app` → attach that policy → create an **access key** (type: application running outside AWS / other). Save the key + secret — these become the app's `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`.
4. Install the SDK and commit the lockfile change:
   ```
   npm i @aws-sdk/client-s3
   ```
5. **Migrate existing local videos** (uploaded files live under `public/uploads/videos`):
   ```
   aws s3 sync public/uploads/videos s3://gotutors-videos-<name>/videos
   ```
   Keep the key prefix identical to how `storage.ts` writes new files so old URLs keep resolving (check the prefix it uses and mirror it).

---

## 3. Container image — ECR

The repo now includes a production `Dockerfile`.

1. Create the registry (one-time):
   ```
   aws ecr create-repository --repository-name gotutors-academy --region eu-west-2
   ```
2. Build, tag, push (repeat these three on every deploy):
   ```
   aws ecr get-login-password --region eu-west-2 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.eu-west-2.amazonaws.com
   docker build -t gotutors-academy .
   docker tag gotutors-academy:latest <ACCOUNT_ID>.dkr.ecr.eu-west-2.amazonaws.com/gotutors-academy:latest
   docker push <ACCOUNT_ID>.dkr.ecr.eu-west-2.amazonaws.com/gotutors-academy:latest
   ```
   (`<ACCOUNT_ID>` = 12-digit account number, shown top-right in the console.)

---

## 4. App hosting — App Runner

1. Console → **App Runner → Create service**:
   - Source: **Container registry → Amazon ECR** → pick `gotutors-academy:latest`.
   - Deployment trigger: **Automatic** (every ECR push redeploys).
   - ECR access role: create new (default).
2. Service settings:
   - Name: `gotutors-academy`. CPU 1 vCPU, memory 2 GB.
   - **Port: 3000**.
   - Environment variables:

     | Key | Value |
     |---|---|
     | `DATABASE_URL` | the RDS string from step 1.3 |
     | `NEXTAUTH_SECRET` | run `openssl rand -hex 32` and paste |
     | `NEXTAUTH_URL` | the App Runner URL for now (update after step 5) |
     | `UPLOAD_BACKEND` | `s3` |
     | `S3_BUCKET` | `gotutors-videos-<name>` |
     | `S3_REGION` | `eu-west-2` |
     | `S3_ACCESS_KEY_ID` | from step 2.3 |
     | `S3_SECRET_ACCESS_KEY` | from step 2.3 |
     | `RATE_LIMIT_WINDOW_SEC` | `60` |

     (Better long-term: store secrets in **SSM Parameter Store** and reference them — App Runner supports `Secrets` sources for env vars.)
   - Health check: HTTP, path `/login`.
3. Create & deploy. First deploy takes ~5 minutes. You'll get a URL like `https://xxxx.eu-west-2.awsapprunner.com` — set `NEXTAUTH_URL` to exactly that (Service → Configuration → Edit → redeploy) and log in to verify.
4. Allow App Runner to reach RDS: RDS security group → add inbound rule PostgreSQL 5432 with source `0.0.0.0/0` **temporarily**, or better: give the App Runner service a **VPC connector** (App Runner → Networking → Outgoing → VPC) into the RDS VPC, then restrict the DB security group to that connector's security group. The VPC connector route is the production-correct one.

---

## 5. Domain + HTTPS — Route 53 / ACM

1. Route 53 → register (or transfer) your domain, e.g. `academy.gotutors.com`.
2. App Runner → your service → **Custom domains → Link domain** → enter the domain. App Runner gives you CNAME/validation records; Route 53 can add them automatically. TLS certificates are issued and renewed for you.
3. Update `NEXTAUTH_URL` to `https://academy.gotutors.com` and redeploy.

---

## 6. Deploying updates (your routine from now on)

```
git pull
docker build -t gotutors-academy .
docker tag gotutors-academy:latest <ACCOUNT_ID>.dkr.ecr.eu-west-2.amazonaws.com/gotutors-academy:latest
docker push <ACCOUNT_ID>.dkr.ecr.eu-west-2.amazonaws.com/gotutors-academy:latest
```
App Runner auto-deploys the new image. If the Prisma schema changed, run `npx prisma db push` against the RDS `DATABASE_URL` first (from your machine, using the quoted `set` form from step 1.4), then push the image.

---

## 7. Production hardening checklist

- [ ] RDS: turn **Public access off** once the VPC connector works; keep the security group limited to the connector + your IP.
- [ ] RDS: automated **backups** on (7–35 days) and deletion protection enabled.
- [ ] Rotate the master DB password and the `gotutors-app` access keys; store them in **SSM Parameter Store (SecureString)**.
- [ ] CloudWatch: App Runner logs are automatic — add an **alarm** on 5xx rate and on RDS `FreeStorageSpace`.
- [ ] Set the **budget alert** if you skipped step 0.
- [ ] Never run `prisma/seed.ts` against production (it's for fresh dev installs) — bootstrap with `npm run db:create-admin` (step 1.5), then create real accounts from the Users/Trainees pages.
- [ ] Delete the demo one-click logins before going live: they're in `src/app/login/page.tsx` (the "Demo accounts" block). If you restored a dump from local rather than starting empty, also remove the `*@gotutors.test` users it carried across.

---

## Alternatives (when to pick something else)

- **AWS Amplify Hosting** — no Docker: connect the GitHub repo, it builds and hosts Next.js SSR itself. Fewer knobs than App Runner; the RDS/S3/env-var steps above are identical. Good if you'd rather never touch Docker.
- **Single EC2 box** (t3.small + nginx + pm2 + local Postgres) — cheapest (~£12/mo all-in) and closest to `npm run dev`, but you own patching, backups, TLS and restarts yourself. Fine for a pilot, not for real usage.
- **ECS Fargate + ALB** — where App Runner grows up to; only worth the extra setup once you need multiple services or fine-grained networking.
