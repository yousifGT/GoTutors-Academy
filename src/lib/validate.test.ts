import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseJson } from "./validate";

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
      expect(payload.error).toBe("Invalid request");
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
