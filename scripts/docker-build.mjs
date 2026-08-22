#!/usr/bin/env node
/**
 * Build the production image with the current commit baked in.
 *
 * `.dockerignore` removes `.git`, so the Dockerfile cannot read the SHA itself —
 * it has to be passed as a build arg. Doing that inline is awkward on Windows
 * cmd (`for /f %i in ('git rev-parse ...')`), and forgetting it silently
 * produces an untraceable image, so it lives in a script that works the same
 * everywhere.
 *
 *   npm run image                 # build, tagged gotutors-academy:latest
 *   npm run image -- --push ECR   # build then push to that registry path
 */
import { execFileSync } from "node:child_process";

function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const sha = git("rev-parse", "--short", "HEAD") || "unknown";
const dirty = git("status", "--porcelain") !== "";
const commit = dirty ? `${sha}-dirty` : sha;
const builtAt = new Date().toISOString();

if (dirty) {
  console.warn("! Uncommitted changes — tagging the image as %s so it is not mistaken for a clean build.\n", commit);
}

const args = ["build", "--build-arg", `GIT_SHA=${commit}`, "--build-arg", `BUILT_AT=${builtAt}`, "-t", "gotutors-academy", "."];
console.log(`Building gotutors-academy at ${commit} (${builtAt})`);
execFileSync("docker", args, { stdio: "inherit" });

const pushIdx = process.argv.indexOf("--push");
if (pushIdx !== -1) {
  const repo = process.argv[pushIdx + 1];
  if (!repo) {
    console.error("--push needs a registry path, e.g. --push 123.dkr.ecr.eu-west-2.amazonaws.com/gotutors-academy");
    process.exit(1);
  }
  const target = repo.includes(":") ? repo : `${repo}:latest`;
  execFileSync("docker", ["tag", "gotutors-academy:latest", target], { stdio: "inherit" });
  execFileSync("docker", ["push", target], { stdio: "inherit" });
  console.log(`\nPushed ${commit} to ${target}`);
}
