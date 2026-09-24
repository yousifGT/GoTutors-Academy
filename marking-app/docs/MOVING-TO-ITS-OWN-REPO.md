# Moving Marker into its own repository

Marker is a standalone application: its own `package.json`, database, accounts,
build and deployment. It sits in this repository only because that is where it
was written — nothing in it imports anything outside `marking-app/`, and nothing
outside `marking-app/` imports it.

## Step 1 — create the empty repository

This is the one step that has to be done by a person. The Claude GitHub App has
no permission to create repositories (it returns
`403 Resource not accessible by integration`), so:

1. Go to <https://github.com/new>.
2. Name it `marker`, set it private.
3. **Do not** tick "Add a README", a `.gitignore` or a licence — the history
   being pushed already has all three, and an initialised repository makes the
   first push a conflict.

## Step 2 — push the app into it, with its history

`git subtree split` rewrites the `marking-app/` subdirectory into a branch whose
root *is* the app. Run from a clone of this repository:

```bash
git checkout claude/relaxed-bohr-6sgt66
git subtree split --prefix=marking-app -b marker-only
git push git@github.com:<owner>/marker.git marker-only:main
```

Verified: the split branch has every commit that touched the app, 125 files at
its root, and nothing from the academy in it.

Then delete `marking-app/` from this repository.

### Without history

Simpler, and usually enough:

```bash
cp -r marking-app ../marker
cd ../marker
rm -rf node_modules .next
git init && git add -A && git commit -m "Marker: AI marking for tutoring centres"
git branch -M main
git remote add origin git@github.com:<owner>/marker.git
git push -u origin main
```

## Step 3 — check the new repository

- [ ] `.env` is **not** committed. It is gitignored here; check again after a
      `cp -r`, which copies it.
- [ ] `npm ci && npm run typecheck && npm test` passes from a fresh clone.
- [ ] A Postgres database exists, and `npx prisma db push` has been run against
      it once.
- [ ] Secrets set wherever it deploys: `DATABASE_URL`, `NEXTAUTH_SECRET`,
      `NEXTAUTH_URL`, `ANTHROPIC_API_KEY`.
- [ ] `UPLOAD_BACKEND=s3` and the `S3_*` variables set, plus
      `npm i @aws-sdk/client-s3`. Without this the app refuses uploads in
      production on purpose.
- [ ] `GET /api/health` returns `{"status":"ok"}` against the deployed URL.
- [ ] The first admin created by visiting `/setup` once.

## What is *not* shared with anything

There is no code, database, table, user account, session or deployment in common
with any other application. The only thing Marker and GoTutors Academy have in
common is that both are TypeScript, Next.js and Prisma, written in the same
house style.
