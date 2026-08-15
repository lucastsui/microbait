import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { cleanHandles } from "./digest.js";

const ROOT = dirname(fileURLToPath(new URL(".", import.meta.url)));
const FILE = join(ROOT, "data", "goals.json");

async function load() {
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    return { goals: [] };
  }
}

async function save(state) {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(state, null, 2) + "\n");
}

export async function listGoals() {
  const state = await load();
  return state.goals;
}

export async function addGoal({ text, handles } = {}) {
  const cleaned = String(text || "").trim().slice(0, 240);
  if (!cleaned) throw new Error("Goal text is required");
  const state = await load();
  const goal = {
    id: randomUUID(),
    text: cleaned,
    handles: cleanHandles(handles),
    created_at: new Date().toISOString(),
  };
  state.goals.unshift(goal);
  state.goals = state.goals.slice(0, 40);
  await save(state);
  return goal;
}

export async function removeGoal(id) {
  const state = await load();
  const before = state.goals.length;
  state.goals = state.goals.filter((g) => g.id !== id);
  if (state.goals.length === before) return false;
  await save(state);
  return true;
}
