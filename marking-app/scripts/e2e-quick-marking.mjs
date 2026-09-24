#!/usr/bin/env node
/**
 * End-to-end check for quick marking, driven through a real browser.
 *
 * This exists because of a bug unit tests and API tests both missed. Every
 * mutating request is CSRF-checked with `assertSameOrigin`, which requires a
 * JSON content-type — and a bare `fetch(url, { method: "POST" })` sends none.
 * The marking call fired by the upload form and the retry button was therefore
 * rejected with 415 on every press. The paper uploaded fine, the page loaded
 * fine, and the paper simply sat at "Not marked yet" forever.
 *
 * Nothing in vitest could see it: the API tests set the header themselves, so
 * they exercised a request the browser never actually makes. The only way to
 * know this flow works is to press the buttons.
 *
 *   npm i -D playwright        # once; Chromium is usually already present
 *   node scripts/e2e-quick-marking.mjs http://localhost:3100
 *
 * Needs a signed-in-able account and at least one mark scheme with questions —
 * `npm run db:seed` provides both.
 *   E2E_EMAIL, E2E_PASSWORD  (defaults below match the seed)
 */
import zlib from "node:zlib";

const BASE = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL ?? "admin@demo.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "MarkerDemo123";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    console.error("playwright is not installed — run: npm i -D playwright");
    process.exit(2);
  }
}

/** A real 4x4 PNG, so the upload route's type and size checks see the truth. */
function png() {
  const crc32 = (buf) => {
    let c;
    let crc = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
      c = (crc ^ buf[n]) & 0xff;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(4, 0);
  ihdr.writeUInt32BE(4, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(12, 0xff)]);
  const raw = Buffer.concat([row, row, row, row]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const launch = process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {};
const browser = await chromium.launch({ ...launch, args: ["--no-sandbox"] });
const page = await browser.newPage();

/** Requests the page makes, so a silently swallowed failure is still visible. */
const rejected = [];
page.on("response", (res) => {
  if (res.status() >= 400 && new URL(res.url()).pathname.startsWith("/api/")) {
    rejected.push(`${res.status()} ${res.request().method()} ${new URL(res.url()).pathname}`);
  }
});

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/`, { timeout: 30000 });
  check("signs in", true);

  await page.goto(`${BASE}/quick`, { waitUntil: "networkidle" });
  await page.fill('input[placeholder*="Name or reference"]', "e2e paper");
  await page.setInputFiles('input[type="file"]', {
    name: "page1.png",
    mimeType: "image/png",
    buffer: png(),
  });

  await page.click('button:has-text("Mark")');
  // Quick marking with one paper lands on that paper; with several, on the batch.
  await page.waitForURL(/\/(papers|quick)\//, { timeout: 120000 });
  check("uploading and marking navigates to the result", true);

  await page.waitForLoadState("networkidle");
  const body = await page.textContent("body");

  // The bug this script exists for: the paper uploads, the page loads, and the
  // marking never happened. "Not marked yet" here means the mark request was
  // rejected and swallowed.
  check("the paper did not silently stay unmarked", !body.includes("Not marked yet"), "status is still PENDING");

  // Read the status chip itself rather than searching the whole page — "Marked"
  // appears in headings and navigation, so a body-wide match passes even when
  // the paper is still PENDING.
  const statuses = (await page.locator("span.badge").allTextContents()).map((t) => t.trim());
  // With no ANTHROPIC_API_KEY the expected outcome is the human queue, which is
  // a pass: it proves the request reached the server and ran.
  const terminal = ["Needs you", "Marked", "Checked by you", "Marking failed"];
  check(
    "the status chip shows a real marking outcome",
    statuses.some((s) => terminal.includes(s)),
    `chips: ${statuses.join(" | ") || "none"}`
  );

  check("no API request was rejected", rejected.length === 0, rejected.join(", "));
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
