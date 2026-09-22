import { describe, it, expect } from "vitest";
import { describeEnvProblems, describeEnvWarnings } from "./env";

const good = {
  DATABASE_URL: "postgresql://user:pw@db.example.com:5432/marker?schema=public",
  NEXTAUTH_SECRET: "a".repeat(32),
  NEXTAUTH_URL: "https://marker.example.com",
};

describe("describeEnvProblems", () => {
  it("passes a usable configuration", () => {
    expect(describeEnvProblems(good)).toEqual([]);
  });

  it("catches the .env.example placeholders, which are the real-world failure", () => {
    const problems = describeEnvProblems({
      DATABASE_URL: "postgresql://USER:PASS@HOST:5432/DB?schema=public",
      NEXTAUTH_SECRET: "REPLACE_WITH_RANDOM_HEX_32_BYTES",
      NEXTAUTH_URL: "https://your-domain.example",
    });
    expect(problems).toHaveLength(3);
    expect(problems.join(" ")).toContain("placeholder");
  });

  it("rejects a secret that is long enough but still the example value", () => {
    // Exactly 32 characters — a length check alone lets this through.
    expect("REPLACE_WITH_RANDOM_HEX_32_BYTES").toHaveLength(32);
    expect(describeEnvProblems({ ...good, NEXTAUTH_SECRET: "REPLACE_WITH_RANDOM_HEX_32_BYTES" })).toHaveLength(1);
  });

  it("rejects a single-label hostname, which resolves nowhere", () => {
    expect(describeEnvProblems({ ...good, NEXTAUTH_URL: "http://placeholder" }).join(" ")).toContain("not a real hostname");
  });

  it("allows localhost for development", () => {
    expect(describeEnvProblems({ ...good, NEXTAUTH_URL: "http://localhost:3100" })).toEqual([]);
  });

  it("rejects a trailing slash, which breaks sign-in redirects", () => {
    expect(describeEnvProblems({ ...good, NEXTAUTH_URL: "https://marker.example.com/" }).join(" ")).toContain("trailing slash");
  });

  it("reports every problem at once, so one deploy tells the whole story", () => {
    expect(describeEnvProblems({}).length).toBeGreaterThan(2);
  });

  it("requires the S3 settings once S3 is switched on", () => {
    expect(describeEnvProblems({ ...good, UPLOAD_BACKEND: "s3" })).toHaveLength(4);
  });
});

describe("describeEnvWarnings", () => {
  it("says marking is off rather than pretending it works", () => {
    expect(describeEnvWarnings({}).join(" ")).toContain("ANTHROPIC_API_KEY");
  });

  it("is quiet when everything is set", () => {
    expect(describeEnvWarnings({ ANTHROPIC_API_KEY: "sk-ant-x", NODE_ENV: "development" })).toEqual([]);
  });

  it("warns that production uploads are refused without durable storage", () => {
    const warnings = describeEnvWarnings({ ANTHROPIC_API_KEY: "sk-ant-x", NODE_ENV: "production" });
    expect(warnings.join(" ")).toContain("UPLOAD_BACKEND");
  });
});
