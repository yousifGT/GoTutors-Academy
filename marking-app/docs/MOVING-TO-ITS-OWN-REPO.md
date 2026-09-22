# Moving Marker into its own repository

Marker is a standalone application: its own `package.json`, database, accounts,
build and deployment. It sits in this repository only because that is where it
was written — nothing in it imports anything outside `marking-app/`, and nothing
outside `marking-app/` imports it.

To split it out, with history:

```bash
# From a clone of this repository
git subtree split --prefix=marking-app -b marker-only

# Create the new empty repository on GitHub first, then:
git push git@github.com:<owner>/marker.git marker-only:main
```

Or without history, which is simpler and usually enough:

```bash
cp -r marking-app ../marker
cd ../marker
rm -rf node_modules .next
git init && git add -A && git commit -m "Marker: AI marking for tutoring centres"
git remote add origin git@github.com:<owner>/marker.git
git push -u origin main
```

Then delete `marking-app/` from this repository.

## Checklist for the new repository

- [ ] `.env` is **not** committed (it is gitignored here; check again after the copy).
- [ ] Repository secrets set for CI: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ANTHROPIC_API_KEY`.
- [ ] A Postgres database provisioned, and `npx prisma db push` run against it once.
- [ ] `UPLOAD_BACKEND=s3` and the `S3_*` variables set, plus `npm i @aws-sdk/client-s3`.
- [ ] `GET /api/health` returns `{"status":"ok"}` against the deployed URL.
- [ ] First admin created by visiting `/setup` once.

## What is *not* shared with anything

There is no code, database, table, user account, session or deployment in common
with any other application. The only thing the two have in common is that they
were both written in TypeScript with Next.js and Prisma, in the same house
style.
