import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { briefingFromSources, normalizeHandle } from "./neutralize.js";

const ROOT = dirname(fileURLToPath(new URL(".", import.meta.url)));
const CORPUS = JSON.parse(readFileSync(join(ROOT, "fixtures", "bait-corpus.json"), "utf8"));

export function cleanHandles(handles) {
  const list = Array.isArray(handles) ? handles : String(handles || "").split(/[\s,]+/);
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const h = normalizeHandle(raw);
    if (!h || seen.has(h.toLowerCase())) continue;
    seen.add(h.toLowerCase());
    out.push(h);
  }
  return out.slice(0, 20);
}

function fixtureForGoal(goal) {
  const g = String(goal || "").toLowerCase();
  if (g.includes("friend")) return CORPUS.find((f) => f.id === "friends-public");
  if (g.includes("tech")) return CORPUS.find((f) => f.id === "tech-chip");
  if (g.includes("health") || g.includes("science")) return CORPUS.find((f) => f.id === "science-paper");
  if (g.includes("market")) return CORPUS.find((f) => f.id === "finance-fomo");
  return CORPUS.find((f) => f.id === "world-vote");
}

export function demoBriefing(goal, handles = []) {
  const fixture = fixtureForGoal(goal);
  return briefingFromSources(goal || fixture.goal, fixture.sources, {
    mode: "demo",
    notes: ["Eval fixture."],
    sources_consulted: ["fixture:" + fixture.id],
  });
}
