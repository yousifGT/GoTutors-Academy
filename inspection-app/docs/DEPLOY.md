# Deploying the inspection app to AWS

Written for someone standing up this app for the first time. It assumes an AWS
account and nothing else.

Everything here is the app's side of the contract: what it needs, why, and what
happens if it does not get it. **None of it has been run against a real AWS
account** — the application itself has been tested against a real PostgreSQL, a
real S3 API and a real SMTP server, but the infrastructure below is written from
the app's requirements, not from a deployment that has happened. Treat it as a
specification to work through rather than a script that is known to work.

The app refuses to start if any of this is wrong in a way it can detect. That is
deliberate: see `src/lib/config.ts`.

---

## 1. What it needs, and why

| Service | For | Why not something else |
|---|---|---|
| **RDS PostgreSQL** | everything | The schema uses enums, arrays and real foreign keys. Aurora Serverless v2 also works and costs less when idle. |
| **S3** | photographs and signatures | A container filesystem does not survive a redeploy, and two tasks cannot see each other's files. |
| **SES** | the report email | Anything speaking SMTP works too — set `EMAIL_BACKEND=smtp` instead. |
| **ECS Fargate** (or App Runner) | running the app | It is a long-running Node server: it holds a database pool and runs a background sweep for unsent reports. Lambda would break both. |
| **ALB** | in front | Terminates TLS and health-checks `/api/health`. |
| **Secrets Manager** | the database URL and the session secret | So they are not in a task definition anyone with console read access can see. |

**Region: choose a UK or EU one and do not change your mind.** An S3 bucket's
region is fixed at creation, and this app holds photographs taken inside
settings where children are present. `eu-west-2` (London) is the obvious choice.

---

## 2. In order

### 2.1 The database

RDS PostgreSQL 16, in private subnets, not publicly accessible. `db.t4g.micro`
is enough to start; the data is small and the query load is a handful of people.

Turn on:
- **Automated backups**, 30 days. This is the only copy of the inspection record.
- **Deletion protection.**
- **Encryption at rest** (cannot be added later without a snapshot restore).
- **Performance Insights** — free at 7 days, and the thing you will want the
  first time a page is slow.

Put the connection string in Secrets Manager as `DATABASE_URL`, in the form
`postgresql://user:password@host:5432/inspection?schema=public&connection_limit=5`.

`connection_limit` matters. Prisma opens a pool **per task**, and the default is
`(cores × 2) + 1`. Four tasks on 2 vCPU each is 20 connections before anything
else connects; `db.t4g.micro` allows about 85. Set it explicitly so scaling out
does not exhaust the database. If you ever run more than about ten tasks, put
RDS Proxy in front instead of raising it.

### 2.2 The bucket

One private bucket, e.g. `gotutors-inspection-uploads`.

- **Block all public access** — on. The app streams objects through an
  authenticated route and never hands a bucket address to a browser, so nothing
  needs public read.
- **Default encryption**: SSE-S3 (the app also sets it per object).
- **Versioning**: on. It is the difference between a mistaken delete being an
  inconvenience and being gone.
- **Lifecycle rule**: whatever your retention policy says. There is not one in
  the code because it is a decision for the business, not for the developer —
  see §6.

### 2.3 Sending mail

In SES, verify the domain you will send from (DKIM), then:

- **Leave the sandbox.** In the sandbox SES will only deliver to addresses that
  have themselves been verified, so reports to real centre heads silently go
  nowhere. This needs a support request and is not instant — start it early.
- Create a **configuration set** with an SNS destination for bounces and
  complaints, and set `SES_CONFIGURATION_SET`. An address that hard-bounces and
  nobody notices is a report everyone believes was delivered.
- Set `EMAIL_FROM` to an address at the verified domain, and `EMAIL_REPLY_TO`
  to one a person actually reads — the report email invites a reply.

### 2.4 Permissions

Give the **task role** this, and no static keys anywhere:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Uploads",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::gotutors-inspection-uploads/*"
    },
    {
      "Sid": "HealthCheckReachesTheBucket",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::gotutors-inspection-uploads"
    },
    {
      "Sid": "SendTheReport",
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "*"
    }
  ]
}
```

With no `S3_ACCESS_KEY_ID` / `SES_ACCESS_KEY_ID` in the environment, both SDKs
fall back to this role. That is the point: nothing long-lived to leak or rotate.

The **execution role** additionally needs `secretsmanager:GetSecretValue` on the
two secrets, and the usual `AmazonECSTaskExecutionRolePolicy`.

### 2.5 The task definition

```json
{
  "family": "gotutors-inspection",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::<account>:role/gotutors-inspection-exec",
  "taskRoleArn": "arn:aws:iam::<account>:role/gotutors-inspection-task",
  "containerDefinitions": [
    {
      "name": "app",
      "image": "<account>.dkr.ecr.eu-west-2.amazonaws.com/gotutors-inspection:<tag>",
      "portMappings": [{ "containerPort": 3100, "protocol": "tcp" }],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "NEXTAUTH_URL", "value": "https://inspections.example.com" },
        { "name": "UPLOAD_BACKEND", "value": "s3" },
        { "name": "S3_BUCKET", "value": "gotutors-inspection-uploads" },
        { "name": "S3_REGION", "value": "eu-west-2" },
        { "name": "EMAIL_BACKEND", "value": "ses" },
        { "name": "SES_REGION", "value": "eu-west-2" },
        { "name": "EMAIL_FROM", "value": "GoTutors Inspections <inspections@example.com>" },
        { "name": "EMAIL_REPLY_TO", "value": "inspections@example.com" },
        { "name": "TRUSTED_PROXY_HOPS", "value": "1" }
      ],
      "secrets": [
        { "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:...:DATABASE_URL" },
        { "name": "NEXTAUTH_SECRET", "valueFrom": "arn:aws:secretsmanager:...:NEXTAUTH_SECRET" }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""],
        "interval": 30, "timeout": 5, "retries": 3, "startPeriod": 30
      },
      "stopTimeout": 30,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/gotutors-inspection",
          "awslogs-region": "eu-west-2",
          "awslogs-stream-prefix": "app"
        }
      }
    }
  ]
}
```

Notes on the parts that are easy to get wrong:

- **`NEXTAUTH_SECRET` must not be the Dockerfile's build placeholder.** That
  value is committed to this repository, so a session token signed with it is
  forgeable by anyone who can read the source. The app refuses to start if it
  sees it. Generate one with `openssl rand -hex 32`.
- **`NEXTAUTH_URL` must be `https://`.** Session cookies are only marked Secure
  when it is, so over http they travel in the clear. The app refuses to start
  otherwise.
- **`TRUSTED_PROXY_HOPS`** is how many proxies sit in front. 1 behind an ALB
  alone; 2 with CloudFront in front of it. Wrong, and the per-address rate limit
  either blocks the load balancer or stops nobody.
- **`stopTimeout: 30`** gives in-flight work time to finish. The app closes
  cleanly on SIGTERM — verified: a report render already in progress completes
  before the process exits.

### 2.6 Load balancer

- Target group on **3100**, health check path **`/api/health`**, healthy after
  2, unhealthy after 3, interval 30s.
- **Deregistration delay 30s**, to match `stopTimeout`.
- Listener on 443 with an ACM certificate; redirect 80 to 443.
- Idle timeout 60s is fine — the slowest thing here is rendering a PDF.

`/api/health` returns 503 when the database or the bucket cannot be reached, so
a task that cannot serve photographs leaves rotation instead of failing uploads
in someone's hands on site.

### 2.7 Releasing

Migrations do **not** run when the container starts. Two tasks starting at once
would both try, and a failed migration would take the whole rollout down rather
than one container. Run them as a release step, before the new tasks start:

```bash
# one-off ECS task, same image, same secrets
npm run db:deploy
```

Then update the service. The order matters for any migration that removes or
renames something the running code still reads: add first, deploy, then remove
in a later release. Nothing in the current migrations is destructive.

To create the first administrator, run once with `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` set:

```bash
npm run db:seed
```

Both must be set or it creates nothing. There are no demo accounts, on purpose.

---

## 3. What it costs, roughly

Per month, `eu-west-2`, for the size this is: 23 centres, a handful of
inspections a day.

| | |
|---|---|
| ECS Fargate, 2 × 0.5 vCPU / 1GB | ~£30 |
| RDS `db.t4g.micro`, 20GB, multi-AZ off | ~£15 |
| ALB | ~£18 |
| S3, ~20GB of photographs growing | ~£1 |
| SES, a few hundred messages | ~£0 |
| CloudWatch logs | ~£3 |
| **Total** | **~£67** |

Multi-AZ RDS roughly doubles the database line and is the first thing to add if
an afternoon of downtime would matter.

The one thing that grows without bound is photographs. A retention rule (§6) is
what stops that, and it is a policy decision, not a technical one.

---

## 4. After it is up

Check, in this order:

1. `GET /api/health` returns `{"ok":true,"db":true,"storage":true}`.
2. Sign in as the seeded administrator and **change the password immediately** —
   whoever ran the seed knows it.
3. Create a centre, a centre head and an inspector.
4. Run one inspection end to end on a phone, with a photograph, and confirm the
   report arrives in the centre head's inbox with the PDF attached.
5. Look at `/admin/audit` and confirm all of that is recorded.

Step 4 is the one that catches a half-configured SES account, and it is much
better to catch it than to have a centre head not receive something everyone
believes they were sent.

---

## 5. Watching it

Alarms worth having:

| Alarm | Why |
|---|---|
| Target group unhealthy host count > 0 | the app cannot reach its database or bucket |
| ALB 5xx rate | something is throwing |
| Log filter on `report email: gave up` | a report reached a person's inbox never |
| Log filter on `Refusing to start` | a deploy went out misconfigured |
| RDS free storage / CPU | the usual |
| RDS connection count near the limit | too many tasks for `connection_limit` |

Deliveries that failed are also visible in the database:

```sql
SELECT * FROM "ReportDelivery" WHERE "emailStatus" = 'FAILED';
```

---

## 6. Decisions for the owner, not the developer

These are deliberately not settled in code. Each needs someone at GoTutors to
say what the answer is:

1. **How long are inspection photographs kept?** They are taken inside settings
   where children are present. There is machinery ready for whatever the answer
   is — `npm run uploads:gc` sweeps images no inspection references, and an S3
   lifecycle rule can expire the rest — but the number is a policy decision, and
   a **DPIA** should be reviewed by a data-protection professional before real
   data goes in.
2. **How long are inspection records kept?** Different question, probably a
   longer answer, since they are the evidence of what was inspected and when.
3. **How long is the audit log kept?** It holds names and actions.
4. **Who receives bounce notifications** from SES, and who acts on them.
5. **Whether reports should also go to a free-typed debrief address.** The app
   captures one during the visit but deliberately does not email it: sending
   photographs from a children's setting to an unverified address someone typed
   on a phone should be a decision, not a default.
