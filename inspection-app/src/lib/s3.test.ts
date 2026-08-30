import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { missingConfig, s3Config, _resetClient } from "@/lib/s3";

const KEYS = ["S3_BUCKET", "S3_REGION", "S3_ENDPOINT"];

describe("object store configuration", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    _resetClient();
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
    _resetClient();
  });

  it("names what is missing rather than failing at the first upload", () => {
    // The health check reports this, so a misconfigured deploy is caught by the
    // load balancer instead of by an inspector losing a photo on site.
    expect(missingConfig()).toEqual(["S3_BUCKET", "S3_REGION"]);
    process.env.S3_BUCKET = "gotutors-inspection-uploads";
    expect(missingConfig()).toEqual(["S3_REGION"]);
    process.env.S3_REGION = "eu-west-2";
    expect(missingConfig()).toEqual([]);
  });

  it("refuses to guess a bucket", () => {
    expect(() => s3Config()).toThrow(/S3_BUCKET/);
    process.env.S3_BUCKET = "b";
    expect(() => s3Config()).toThrow(/S3_REGION/);
  });

  it("does not require keys in the environment", () => {
    // On ECS the task role supplies credentials. Demanding an access key would
    // force a long-lived secret into the environment for no reason.
    process.env.S3_BUCKET = "b";
    process.env.S3_REGION = "eu-west-2";
    expect(s3Config()).toEqual({ bucket: "b", region: "eu-west-2", endpoint: undefined });
  });

  it("reads path-style from a non-AWS endpoint", () => {
    // MinIO and R2 are addressed by path, not by a bucket subdomain: that needs
    // a wildcard certificate the operator almost certainly does not have.
    process.env.S3_BUCKET = "b";
    process.env.S3_REGION = "eu-west-2";
    process.env.S3_ENDPOINT = "http://minio.internal:9000";
    expect(s3Config().endpoint).toBe("http://minio.internal:9000");
  });
});
