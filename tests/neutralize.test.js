import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { briefingFromSources, looksLikeAd, neutralizeText } from "../lib/neutralize.js";
import { runCorpus, scoreBriefing } from "../lib/score.js";
import { classifyGoal } from "../lib/sources.js";
import { cleanHandles, demoBriefing } from "../lib/digest.js";

const ROOT = dirname(fileURLToPath(new URL(".", import.meta.url)));
const corpus = JSON.parse(readFileSync(join(ROOT, "fixtures", "bait-corpus.json"), "utf8"));

test("strips ads, shout, and bait while keeping the fact", () => {
  const out = neutralizeText(
    "BREAKING: Apple SHOCKS the world with a new M5 chip. Sponsored: buy now with code HYPE20.",
  );
  const lower = out.toLowerCase();
  assert.match(lower, /apple/);
  assert.match(lower, /m5/);
  assert.doesNotMatch(lower, /sponsored/);
  assert.doesNotMatch(lower, /breaking/);
  assert.doesNotMatch(lower, /hype20/);
});

test("flags promotional copy as ads", () => {
  assert.equal(looksLikeAd("Shop now and use code CHILL50"), true);
  assert.equal(looksLikeAd("The agency released turnout figures on Tuesday"), false);
});

test("corpus neutralization keeps facts and drops bait", () => {
  const { metric, results } = runCorpus(corpus);
  assert.ok(metric >= 0.75, `metric ${metric} below 0.75`);
  for (const row of results) {
    assert.ok(row.structureOk, `${row.id} missing structure`);
    assert.ok(row.keepScore >= 0.5, `${row.id} lost too many facts`);
    assert.ok(row.dropScore >= 0.7, `${row.id} left bait: ${row.dropHits.join(", ")}`);
  }
});

test("briefingFromSources drops a pure ad item", () => {
  const briefing = briefingFromSources("tech", corpus[0].sources);
  const blob = JSON.stringify(briefing).toLowerCase();
  assert.doesNotMatch(blob, /superfan/);
  assert.doesNotMatch(blob, /chill50/);
  assert.match(briefing.omitted.toLowerCase(), /promotional|sponsored/);
});

test("goal classifier and handles", () => {
  assert.equal(classifyGoal("how are my friends doing"), "people");
  assert.equal(classifyGoal("recent tech development"), "tech");
  assert.deepEqual(cleanHandles(["@Ada_Lovelace", "ada_lovelace", "bad handle!!"]), [
    "Ada_Lovelace",
  ]);
});

test("does not split U.S. abbreviations", () => {
  const out = neutralizeText("Canadian petition to expel U.S. Ambassador Pete Hoekstra gained 170000 signatures.");
  assert.match(out.toLowerCase(), /u\.s\. ambassador/);
  assert.match(out, /170000|170,000/);
});

test("demo briefing is structured", () => {
  const briefing = demoBriefing("I want to know recent tech development");
  const scored = scoreBriefing(corpus[0], briefing);
  assert.ok(scored.structureOk);
  assert.ok(briefing.items.length >= 1);
});
