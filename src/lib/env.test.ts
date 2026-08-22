import { describe, it, expect } from "vitest";
import { describeEnvProblems } from "./env";

const valid = {
  DATABASE_URL: "postgresql://user:pass@db.example.com:5432/app?schema=academy&sslmode=require",
  NEXTAUTH_SECRET: "a".repeat(64),
  NEXTAUTH_URL: "https://lms.example.com",
};

describe("describeEnvProblems", () => {
  it("accepts a valid production configuration", () => {
    expect(describeEnvProblems(valid)).toEqual([]);
  });

  it("accepts localhost during development", () => {
    expect(describeEnvProblems({ ...valid, NEXTAUTH_URL: "http://localhost:3000" })).toEqual([]);
  });

  // The failure this module exists to prevent: the app deployed with a
  // placeholder NEXTAUTH_URL and nothing anywhere said so.
  it("rejects a single-label placeholder host", () => {
    const problems = describeEnvProblems({ ...valid, NEXTAUTH_URL: "http://placeholder" });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/placeholder/i);
  });

  it("rejects a trailing slash, which breaks callback URLs", () => {
    expect(describeEnvProblems({ ...valid, NEXTAUTH_URL: "https://lms.example.com/" })[0]).toMatch(/trailing slash/i);
  });

  it("rejects a non-URL", () => {
    expect(describeEnvProblems({ ...valid, NEXTAUTH_URL: "lms.example.com" })[0]).toMatch(/not a valid absolute URL/i);
  });

  it("rejects a non-http scheme", () => {
    expect(describeEnvProblems({ ...valid, NEXTAUTH_URL: "ftp://lms.example.com" })[0]).toMatch(/http or https/i);
  });

  it("flags a missing database URL", () => {
    const { DATABASE_URL, ...rest } = valid;
    expect(describeEnvProblems(rest)[0]).toMatch(/DATABASE_URL is not set/);
  });

  it("flags a database URL that isn't postgres", () => {
    expect(describeEnvProblems({ ...valid, DATABASE_URL: "mysql://x/y" })[0]).toMatch(/postgresql/);
  });

  it("flags a missing secret", () => {
    const { NEXTAUTH_SECRET, ...rest } = valid;
    expect(describeEnvProblems(rest)[0]).toMatch(/NEXTAUTH_SECRET is not set/);
  });

  it("flags a short secret", () => {
    expect(describeEnvProblems({ ...valid, NEXTAUTH_SECRET: "short" })[0]).toMatch(/only 5 characters/);
  });

  it("flags a non-numeric rate limit window", () => {
    expect(describeEnvProblems({ ...valid, RATE_LIMIT_WINDOW_SEC: "sixty" })[0]).toMatch(/whole number/);
  });

  it("accepts a numeric rate limit window", () => {
    expect(describeEnvProblems({ ...valid, RATE_LIMIT_WINDOW_SEC: "60" })).toEqual([]);
  });

  it("requires the S3 settings only when S3 is switched on", () => {
    expect(describeEnvProblems({ ...valid, UPLOAD_BACKEND: "s3" })).toHaveLength(4);
    expect(describeEnvProblems({ ...valid })).toEqual([]);
  });

  it("reports every problem at once, so one deploy tells the whole story", () => {
    const problems = describeEnvProblems({ NEXTAUTH_URL: "http://placeholder" });
    expect(problems).toHaveLength(3);
    expect(problems.join(" ")).toMatch(/DATABASE_URL/);
    expect(problems.join(" ")).toMatch(/NEXTAUTH_SECRET/);
    expect(problems.join(" ")).toMatch(/placeholder/);
  });
});

describe("describeEnvProblems rejects the shipped placeholders", () => {
  // The defect: "REPLACE_WITH_RANDOM_HEX_32_BYTES" is exactly 32 characters, so
  // the length check never fired and the entire example file validated clean —
  // while /api/health reported config ok and the smoke test printed all-passed.
  it("rejects the exact placeholder that passed the length check", () => {
    const problems = describeEnvProblems({
      DATABASE_URL: "postgresql://u:p@db.example.com:5432/app",
      NEXTAUTH_SECRET: "REPLACE_WITH_RANDOM_HEX_32_BYTES",
      NEXTAUTH_URL: "https://app.example.com",
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/placeholder/i);
  });

  it("finds a problem in every line of the shipped .env.example", () => {
    const problems = describeEnvProblems({
      DATABASE_URL: "postgresql://USER:PASS@HOST:5432/DB?schema=public",
      NEXTAUTH_SECRET: "",
      NEXTAUTH_URL: "https://your-domain.example",
      RATE_LIMIT_WINDOW_SEC: "60",
    });
    expect(problems.some((p) => /DATABASE_URL/.test(p))).toBe(true);
    expect(problems.some((p) => /NEXTAUTH_SECRET/.test(p))).toBe(true);
    expect(problems.some((p) => /NEXTAUTH_URL/.test(p))).toBe(true);
  });

  it("still accepts a real configuration", () => {
    expect(
      describeEnvProblems({
        DATABASE_URL: "postgresql://u:p@db.example.com:5432/app?schema=academy",
        NEXTAUTH_SECRET: "a".repeat(64),
        NEXTAUTH_URL: "https://www.gotutors.academy",
      })
    ).toEqual([]);
  });
});
