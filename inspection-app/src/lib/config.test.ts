import { describe as group, it, expect } from "vitest";
import { describe, fatals, isDeployed, problems } from "@/lib/config";

const BASE = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@db.internal:5432/inspection",
  NEXTAUTH_SECRET: "0123456789abcdef0123456789abcdef",
  NEXTAUTH_URL: "https://inspections.gotutors.com",
  UPLOAD_BACKEND: "s3",
  S3_BUCKET: "gotutors-inspection-uploads",
  S3_REGION: "eu-west-2",
} as unknown as NodeJS.ProcessEnv;

const env = (over: Record<string, string | undefined>) => {
  const out = { ...BASE, ...over } as Record<string, string | undefined>;
  for (const [k, v] of Object.entries(over)) if (v === undefined) delete out[k];
  return out as NodeJS.ProcessEnv;
};
const keys = (e: NodeJS.ProcessEnv) => fatals(e).map((p) => p.key).sort();

group("configuration check", () => {
  it("passes a correctly configured production environment", () => {
    expect(problems(BASE)).toEqual([]);
  });

  it("reports every fault at once, not the first one", () => {
    // An operator who fixes one variable, redeploys, waits, and finds the next
    // has been made to do the deployment four times.
    const broken = env({ DATABASE_URL: undefined, NEXTAUTH_SECRET: undefined, NEXTAUTH_URL: undefined, S3_BUCKET: undefined });
    expect(keys(broken)).toEqual(["DATABASE_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL", "S3_BUCKET"]);
  });

  it("catches the Docker build placeholder reaching runtime", () => {
    // The Dockerfile sets this so `next build` can run. If it survives into a
    // running container every session token is signed with a value committed to
    // this repository.
    const found = fatals(env({ NEXTAUTH_SECRET: "build-time-placeholder" }));
    expect(found.map((p) => p.key)).toEqual(["NEXTAUTH_SECRET"]);
    expect(found[0].message).toMatch(/forgeable/);
  });

  it("refuses a short signing secret", () => {
    expect(keys(env({ NEXTAUTH_SECRET: "short" }))).toEqual(["NEXTAUTH_SECRET"]);
  });

  it("refuses http on a deployed host", () => {
    // Session cookies are only marked Secure when the URL says https.
    expect(keys(env({ NEXTAUTH_URL: "http://inspections.gotutors.com" }))).toEqual(["NEXTAUTH_URL"]);
  });

  it("does not mistake a production build running locally for a deployment", () => {
    // `next start` sets NODE_ENV=production unconditionally, so it is also what
    // you get building the app and running it on a laptop — which is how the
    // browser tests run. Keying the strict checks on NODE_ENV made the app
    // refuse to start there.
    const local = env({ NEXTAUTH_URL: "http://localhost:3100", UPLOAD_BACKEND: undefined, S3_BUCKET: undefined, S3_REGION: undefined });
    expect(isDeployed(local)).toBe(false);
    expect(problems(local)).toEqual([]);
    expect(isDeployed(env({ NEXTAUTH_URL: "http://127.0.0.1:3100" }))).toBe(false);
    expect(isDeployed(env({ NODE_ENV: "development" }))).toBe(false);
  });

  it("treats anything not plainly local as deployed", () => {
    // The failure has to land on the safe side: a host it cannot make sense of
    // gets the strict checks, not a free pass.
    expect(isDeployed(BASE)).toBe(true);
    expect(isDeployed(env({ NEXTAUTH_URL: "https://inspections.internal" }))).toBe(true);
    expect(isDeployed(env({ NEXTAUTH_URL: "not a url" }))).toBe(true);
  });

  it("refuses local disk uploads on a deployment unless someone says so on purpose", () => {
    // Photographs on a container filesystem are wiped by the next redeploy.
    // Nobody should arrive at that by leaving a variable unset.
    const found = fatals(env({ UPLOAD_BACKEND: undefined, S3_BUCKET: undefined, S3_REGION: undefined }));
    expect(found.map((p) => p.key)).toEqual(["UPLOAD_BACKEND"]);
    expect(
      fatals(env({ UPLOAD_BACKEND: undefined, S3_BUCKET: undefined, S3_REGION: undefined, ALLOW_LOCAL_UPLOADS: "1" }))
    ).toEqual([]);
  });

  it("catches half-set S3 credentials", () => {
    // Both or neither: neither means the ECS task role, one means a typo.
    expect(keys(env({ S3_ACCESS_KEY_ID: "AKIA..." }))).toEqual(["S3_ACCESS_KEY_ID"]);
    expect(fatals(env({ S3_ACCESS_KEY_ID: "AKIA...", S3_SECRET_ACCESS_KEY: "secret" }))).toEqual([]);
  });

  it("warns rather than fails on things that merely look wrong", () => {
    const found = problems(env({ DATABASE_URL: "postgresql://u:p@localhost:5432/inspection" }));
    expect(found.map((p) => [p.key, p.severity])).toEqual([["DATABASE_URL", "warning"]]);
    expect(fatals(env({ DATABASE_URL: "postgresql://u:p@localhost:5432/inspection" }))).toEqual([]);
  });

  it("warns when the seed is half-configured", () => {
    const found = problems(env({ SEED_ADMIN_EMAIL: "admin@gotutors.com" }));
    expect(found.map((p) => p.key)).toEqual(["SEED_ADMIN_PASSWORD"]);
  });

  it("prints something an operator can act on", () => {
    const text = describe(problems(env({ NEXTAUTH_SECRET: undefined })));
    expect(text).toContain("NEXTAUTH_SECRET");
    expect(text).toContain("FATAL");
    expect(describe([])).toBe("Configuration OK.");
  });
});
