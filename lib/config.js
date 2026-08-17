import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { providerAvailable } from "./brief-ai.js";

export const DEFAULT_MODEL = "google/gemma-4-26b-a4b-it:free";
export const FALLBACK_MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
];
const RESERVED_HANDLES = new Set(["x", "home", "explore", "i", "login", "logout", "settings"]);

function configDir() {
  return process.env.MICROBAIT_HOME || join(homedir(), ".microbait");
}

function configPath() {
  return join(configDir(), "config.json");
}

export function realHandle(...candidates) {
  for (const raw of candidates) {
    const handle = String(raw || "")
      .replace(/^@/, "")
      .trim();
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) continue;
    if (RESERVED_HANDLES.has(handle.toLowerCase())) continue;
    return handle;
  }
  return "";
}

export function loadConfig() {
  try {
    const cfg = JSON.parse(readFileSync(configPath(), "utf8"));
    const handle = realHandle(cfg.x_username);
    if (cfg.x_username && !handle) delete cfg.x_username;
    else if (handle) cfg.x_username = handle;
    return cfg;
  } catch {
    return {};
  }
}

export function saveConfig(cfg) {
  const next = { ...cfg };
  const handle = realHandle(next.x_username);
  if (handle) next.x_username = handle;
  else delete next.x_username;
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(next, null, 2) + "\n");
  chmodSync(configPath(), 0o600);
}

export function isReady(cfg = loadConfig()) {
  return Boolean(realHandle(cfg.x_username) && providerAvailable(cfg));
}
