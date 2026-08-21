import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseJson, zPassword, zEmail, zPositionName } from "./validate";

function jsonReq(body: unknown) {
  return new Request("https://app.test/api/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const Schema = z.object({ name: z.string().min(1), age: z.number().int().optional() });

describe("parseJson", () => {
  it("returns typed data for a valid body", async () => {
    const r = await parseJson(jsonReq({ name: "Sam", age: 3 }), Schema);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ name: "Sam", age: 3 });
  });

  it("rejects a schema mismatch with 400 and field errors", async () => {
    const r = await parseJson(jsonReq({ name: "" }), Schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      const payload = await r.response.json();
      // The message names the offending field, rather than the old fixed
      // "Invalid request" that left users guessing what was wrong.
      expect(payload.error).toMatch(/^name: /);
      expect(payload.details.name).toBeDefined();
    }
  });

  it("rejects wrong types", async () => {
    const r = await parseJson(jsonReq({ name: "ok", age: "three" }), Schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });

  it("rejects malformed JSON with 400", async () => {
    const bad = new Request("https://app.test/api/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const r = await parseJson(bad, Schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      expect((await r.response.json()).error).toBe("Invalid JSON body");
    }
  });

  it("strips unknown keys by default", async () => {
    const r = await parseJson(jsonReq({ name: "Sam", evil: "x" }), Schema);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ name: "Sam" });
  });
});

// A four-character password was rejected as "Invalid request", with nothing to
// suggest a minimum length existed.
describe("field messages reaching users", () => {
  it("says why a short password was refused", async () => {
    const r = await parseJson(jsonReq({ password: "0000" }), z.object({ password: zPassword }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const payload = await r.response.json();
      expect(payload.error).toBe("password: Password must be at least 6 characters");
    }
  });

  it("names an invalid email", async () => {
    const r = await parseJson(jsonReq({ email: "nope" }), z.object({ email: zEmail }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const payload = await r.response.json();
      expect(payload.error).toMatch(/valid email address/);
    }
  });

  it("lists every bad field, not just the first", async () => {
    const r = await parseJson(
      jsonReq({ password: "0000", email: "nope" }),
      z.object({ password: zPassword, email: zEmail })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const payload = await r.response.json();
      expect(payload.error).toMatch(/password:/);
      expect(payload.error).toMatch(/email:/);
    }
  });
});

describe("zPositionName", () => {
  it("accepts a real name", () => {
    expect(zPositionName.safeParse("Maths Trainee").success).toBe(true);
    expect(zPositionName.safeParse("Year 11").success).toBe(true);
  });

  // The name that got created and then read as `Trainee:,` in the audit log.
  it("refuses a punctuation-only name", () => {
    expect(zPositionName.safeParse(",").success).toBe(false);
    expect(zPositionName.safeParse("--").success).toBe(false);
    expect(zPositionName.safeParse("   ").success).toBe(false);
  });
});

describe("zEmail", () => {
  // Sign-in lowercases before an exact-match lookup, so a stored capital letter
  // locked the account out for good.
  it("folds the address to lower case", () => {
    const r = zEmail.safeParse("  Name.Surname@GoTutors.com ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("name.surname@gotutors.com");
  });

  it("still rejects a non-address", () => {
    expect(zEmail.safeParse("NOPE").success).toBe(false);
  });
});
