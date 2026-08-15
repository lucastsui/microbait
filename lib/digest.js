import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { briefingFromSources, emptyBriefing, normalizeHandle } from "./neutralize.js";
import { collectPublicSources } from "./sources.js";
import { grokBriefing, hasXaiKey } from "./xai.js";

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
  const notes = [
    "Demo briefing from a frozen corpus. Live public sources were empty or skipped.",
  ];
  if (handles.length) {
    notes.push("Named handles are stored. Live X search needs a SpaceXAI key.");
  }
  return briefingFromSources(goal || fixture.goal, fixture.sources, {
    mode: "demo",
    notes,
    sources_consulted: ["fixture:" + fixture.id],
  });
}

export async function composeBriefing({ goal, handles, prefer } = {}) {
  const cleanedGoal = String(goal || "").trim();
  const people = cleanHandles(handles);
  if (!cleanedGoal) {
    return emptyBriefing("", {
      mode: "local",
      omitted: "No goal was given.",
      notes: ["Write what you want to know, in one sentence."],
    });
  }

  const wantGrok = prefer === "grok" || (prefer !== "local" && prefer !== "demo" && hasXaiKey());
  if (wantGrok && hasXaiKey()) {
    try {
      return await grokBriefing({ goal: cleanedGoal, handles: people });
    } catch (err) {
      const fallback = await composeLocal({ goal: cleanedGoal, handles: people });
      fallback.notes = [
        ...(fallback.notes || []),
        `Grok path failed (${err.message}). Used public sources instead.`,
      ];
      return fallback;
    }
  }

  if (prefer === "demo") return demoBriefing(cleanedGoal, people);
  return composeLocal({ goal: cleanedGoal, handles: people });
}

async function composeLocal({ goal, handles }) {
  const collected = await collectPublicSources(goal, handles);
  if (!collected.sources.length) {
    const demo = demoBriefing(goal, handles);
    demo.notes = [...(demo.notes || []), ...collected.notes];
    return demo;
  }
  return briefingFromSources(goal, collected.sources, {
    mode: "local",
    sources_consulted: collected.consulted,
    notes: collected.notes,
  });
}
