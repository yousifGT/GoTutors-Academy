#!/usr/bin/env node
/**
 * End-to-end check for the forced password change.
 *
 * This flow has broken three times, and every time the unit tests were green:
 *
 *   1. The cookie kept mustChangePassword because middleware only decodes it —
 *      the jwt callback never ran, so the user bounced straight back.
 *   2. Fixed with getSession(), which does reissue the cookie. But the soft
 *      router.replace() was then served Next's cached middleware redirect for
 *      the dashboard route, so the user still landed back on the same screen —
 *      with their password already changed.
 *   3. Guarded here.
 *
 * None of that is visible to vitest: it is browser navigation and client-side
 * router caching. The only way to know it works is to drive a real browser.
 *
 *   npm i -D playwright        # once; Chromium is usually already present
 *   node scripts/e2e-forced-password.mjs http://localhost:3000
 *
 * Needs a user whose mustChangePassword is set. Pass credentials as env vars:
 *   E2E_EMAIL, E2E_PASSWORD  (defaults below are for a throwaway local seed)
 */
const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL ?? "forced@test.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "oldpass1";
const NEW_PASSWORD = process.env.E2E_NEW_PASSWORD ?? `chg-${Date.now().toString(36)}`;

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("playwright is not installed — run: npm i -D playwright");
  process.exit(2);
}

const launch = process.env.PLAYWRIGHT_CHROMIUM
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
  : {};
const browser = await chromium.launch(launch);
const page = await browser.newPage();
let failed = false;

function check(name, ok, detail) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
}

try {
  console.log(`Forced-password flow against ${BASE}`);

  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click("form button");
  await page.waitForURL(/change-password/, { timeout: 20000 });
  check("the hold screen appears after sign-in", true, "/change-password");

  await page.fill("#current-password", PASSWORD);
  await page.fill("#new-password", NEW_PASSWORD);
  await page.fill("#confirm-password", NEW_PASSWORD);
  await page.click('button:has-text("Change password")');

  // The bug: the change succeeds and the user is left looking at the same form.
  await page.waitForFunction(() => !location.pathname.startsWith("/change-password"), null, { timeout: 20000 })
    .catch(() => {});
  const landed = new URL(page.url()).pathname;
  check(
    "the change releases the hold and moves them on",
    !landed.startsWith("/change-password"),
    landed.startsWith("/change-password")
      ? "still on the hold screen — the password changed but the user is stranded"
      : `landed on ${landed}`
  );

  // The hold must be genuinely gone, not merely navigated past.
  await page.goto(`${BASE}/change-password`);
  await page.waitForTimeout(1000);
  const revisit = new URL(page.url()).pathname;
  check("revisiting the hold screen redirects away", !revisit.startsWith("/change-password"), revisit);
} catch (e) {
  check("flow completed", false, e instanceof Error ? e.message : String(e));
} finally {
  await browser.close();
}

console.log(failed ? "\nFAILED" : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
