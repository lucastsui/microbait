#!/usr/bin/env node
/** Drive the real Electron window over CDP. Does not launch a second browser. */
import { chromium } from "playwright-core";

const CDP = process.env.MICROBAIT_CDP_URL || "http://127.0.0.1:9222";
const GOAL = process.argv.slice(2).join(" ") || "Recent tech trends";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const browser = await chromium.connectOverCDP(CDP).catch((err) => {
  fail(`Could not attach to Microbait (${CDP}). Start the app, then retry.\n${err.message}`);
});

const pages = browser.contexts().flatMap((ctx) => ctx.pages());
const page =
  pages.find((p) => /microbait/i.test(p.url()) || /3847|127\.0\.0\.1/.test(p.url())) ||
  pages.find((p) => /Microbait/i.test(p.url())) ||
  pages[0];

if (!page) fail("No Electron page found. Is Microbait open?");

await page.bringToFront();
const status = await page.evaluate(async () => {
  const res = await fetch("/api/status");
  return res.json();
});
console.log(
  "status",
  JSON.stringify({
    ready: status.ready,
    x: status.x,
    hasKey: status.hasKey,
    opencode: status.opencode
      ? { ok: status.opencode.ok, model: status.opencode.model, hasKey: status.opencode.hasKey }
      : null,
  }),
);
if (!status.ready) {
  fail("App is not ready (need X plus Grok CLI or OpenCode). Connect in the window first.");
}

if (await page.locator("#desk").isHidden()) {
  await page.reload({ waitUntil: "domcontentloaded" });
}

await page.locator("#desk").waitFor({ state: "visible", timeout: 15_000 });
await page.locator("#goal").fill(GOAL);
await page.locator("#chat button[type=submit]").click();
await page.locator(".bubble.brief").waitFor({ state: "visible", timeout: 180_000 });
await page.waitForFunction(
  () => {
    const el = [...document.querySelectorAll(".bubble.brief")].at(-1);
    const t = el?.innerText || "";
    return /Event:/.test(t) && /New Demand/.test(t) && /\[@/.test(t);
  },
  undefined,
  { timeout: 180_000 },
);
await page.locator(".bubble.brief .job-list, .bubble.brief .job-empty").first().waitFor({
  state: "visible",
  timeout: 180_000,
});

const text = (await page.locator(".bubble.brief").last().innerText()).trim();
if (!text || /failed|connect x first|openrouter key first|no posts/i.test(text)) {
  fail(`Briefing did not render a summary:\n${text}`);
}
if (!/Event:/.test(text) || !/New Demand/.test(text) || !/\[@/.test(text)) {
  fail(`Briefing missing Event, @handle, or New Demand:\n${text}`);
}
const hrefs = await page.locator(".bubble.brief a.author-link").evaluateAll((els) => els.map((a) => a.href));
if (!hrefs.length || hrefs.some((h) => !/\/status\/\d+/.test(h))) {
  fail(`Author links must point at posts, got:\n${hrefs.join("\n")}`);
}

console.log("briefing");
console.log(text);
console.log("e2e ok");
await browser.close();
process.exit(0);
