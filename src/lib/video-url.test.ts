import { describe, it, expect } from "vitest";
import { isValidVideoUrl } from "./video-url";

describe("isValidVideoUrl", () => {
  it("accepts provider-matched https URLs", () => {
    expect(isValidVideoUrl("YOUTUBE", "https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isValidVideoUrl("YOUTUBE", "https://youtu.be/abc")).toBe(true);
    expect(isValidVideoUrl("VIMEO", "https://vimeo.com/123")).toBe(true);
    expect(isValidVideoUrl("VIMEO", "https://player.vimeo.com/video/123")).toBe(true);
    expect(isValidVideoUrl("LOOM", "https://www.loom.com/share/abc")).toBe(true);
  });

  it("rejects off-provider hosts", () => {
    expect(isValidVideoUrl("YOUTUBE", "https://evil.com/watch?v=abc")).toBe(false);
    expect(isValidVideoUrl("VIMEO", "https://youtube.com/123")).toBe(false);
    expect(isValidVideoUrl("YOUTUBE", "https://notyoutube.com")).toBe(false);
  });

  it("rejects non-https and dangerous schemes", () => {
    expect(isValidVideoUrl("YOUTUBE", "http://www.youtube.com/watch?v=abc")).toBe(false);
    expect(isValidVideoUrl("YOUTUBE", "javascript:alert(1)")).toBe(false);
    expect(isValidVideoUrl("LOOM", "data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isValidVideoUrl("VIMEO", "not a url")).toBe(false);
  });

  it("handles UPLOAD: local path or https, never dangerous schemes", () => {
    expect(isValidVideoUrl("UPLOAD", "/uploads/videos/abc.mp4")).toBe(true);
    expect(isValidVideoUrl("UPLOAD", "https://cdn.example.com/videos/abc.mp4")).toBe(true);
    expect(isValidVideoUrl("UPLOAD", "http://cdn.example.com/abc.mp4")).toBe(false);
    expect(isValidVideoUrl("UPLOAD", "javascript:alert(1)")).toBe(false);
  });
});
