import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  backendName,
  contentTypeForKey,
  hrefForKey,
  hrefsForKey,
  isAcceptedType,
  keyFromHref,
  usingS3,
} from "@/lib/storage";

const KEY = "photos/0123456789abcdef0123456789abcdef.jpg";

describe("stored image paths", () => {
  it("stores an app URL, not a storage location", () => {
    // The point of the indirection: switching the backend must not rewrite a
    // single row. What is in the database names the route that serves the
    // image, and the route decides where the bytes come from.
    expect(hrefForKey(KEY)).toBe("/api/uploads/photos/0123456789abcdef0123456789abcdef.jpg");
    expect(keyFromHref(hrefForKey(KEY))).toBe(KEY);
  });

  it("still reads images stored before uploads moved behind the route", () => {
    expect(keyFromHref("/uploads/photos/0123456789abcdef0123456789abcdef.jpg")).toBe(KEY);
  });

  it("looks a row up under either form", () => {
    expect(hrefsForKey(KEY)).toEqual([
      "/api/uploads/photos/0123456789abcdef0123456789abcdef.jpg",
      "/uploads/photos/0123456789abcdef0123456789abcdef.jpg",
    ]);
  });

  it("accepts signatures as well as photos", () => {
    expect(keyFromHref("/api/uploads/signatures/0123456789abcdef0123456789abcdef.png")).toBe(
      "signatures/0123456789abcdef0123456789abcdef.png"
    );
  });

  it("refuses anything this app did not generate", () => {
    for (const bad of [
      "/etc/passwd",
      "file:///etc/passwd",
      "javascript:alert(1)",
      // An arbitrary URL rendered in someone's report is a tracking pixel.
      "https://evil.example/pixel.gif",
      "https://cdn.test/photos/0123456789abcdef0123456789abcdef.jpg",
      // Traversal is rejected by the shape of the key, not by normalising it
      // afterwards — there is no path handling here to get wrong.
      "/api/uploads/photos/../../secret.jpg",
      "/uploads/photos/../../../etc/passwd",
      "/api/uploads/photos/0123456789ABCDEF0123456789abcdef.jpg", // uppercase hex
      "/api/uploads/photos/0123456789abcdef.jpg", // too short
      "/api/uploads/photos/0123456789abcdef0123456789abcdef.svg", // scriptable
      "/api/uploads/photos/0123456789abcdef0123456789abcdef.jpg.exe",
      "/api/uploads/other/0123456789abcdef0123456789abcdef.jpg",
      "/api/uploads/",
      "",
    ]) {
      expect(keyFromHref(bad), bad).toBeNull();
    }
  });

  it("names a content type from the key, never from the request", () => {
    expect(contentTypeForKey(KEY)).toBe("image/jpeg");
    expect(contentTypeForKey("signatures/aa.png")).toBe("image/png");
    expect(contentTypeForKey("photos/aa.webp")).toBe("image/webp");
    expect(contentTypeForKey("photos/aa.heic")).toBe("image/heic");
    expect(contentTypeForKey("photos/aa.unknown")).toBe("application/octet-stream");
  });

  it("accepts the image types a phone produces, and nothing else", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp", "image/heic"]) expect(isAcceptedType(t)).toBe(true);
    for (const t of ["image/svg+xml", "text/html", "application/pdf", "video/mp4", ""]) {
      expect(isAcceptedType(t), t).toBe(false);
    }
  });
});

describe("which backend", () => {
  const saved = process.env.UPLOAD_BACKEND;
  beforeEach(() => delete process.env.UPLOAD_BACKEND);
  afterEach(() => {
    if (saved === undefined) delete process.env.UPLOAD_BACKEND;
    else process.env.UPLOAD_BACKEND = saved;
  });

  it("is local disk unless S3 is asked for by name", () => {
    expect(usingS3()).toBe(false);
    expect(backendName()).toBe("local");
    // Anything short of the exact value stays on disk: a half-set variable must
    // not silently send photos somewhere nobody configured.
    for (const v of ["", "S3", "true", "aws", "s3 "]) {
      process.env.UPLOAD_BACKEND = v;
      expect(usingS3(), JSON.stringify(v)).toBe(false);
    }
    process.env.UPLOAD_BACKEND = "s3";
    expect(usingS3()).toBe(true);
    expect(backendName()).toBe("s3");
  });
});
