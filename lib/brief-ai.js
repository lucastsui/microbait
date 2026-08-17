import { grokAvailable, grokStatus, callGrok } from "./grok-cli.js";
import { callOpenCode, openCodeAvailable, openCodeStatus } from "./opencode.js";

export const PROVIDERS = ["grok", "opencode"];

export function normalizeProvider(raw) {
  const id = String(raw || "").trim().toLowerCase();
  return id === "opencode" ? "opencode" : "grok";
}

export function currentProvider(cfg = {}) {
  return normalizeProvider(cfg.ai || process.env.MICROBAIT_AI);
}

export function providerStatus(cfg = {}) {
  const id = currentProvider(cfg);
  if (id === "opencode") {
    const oc = openCodeStatus(cfg);
    return {
      id,
      label: "OpenCode API",
      ok: oc.ok,
      error: oc.error,
      model: oc.model,
    };
  }
  const grok = grokStatus();
  return {
    id: "grok",
    label: "Grok CLI",
    ok: grok.ok,
    error: grok.error,
    model: grok.model,
  };
}

export function providerAvailable(cfg = {}) {
  return currentProvider(cfg) === "opencode" ? openCodeAvailable(cfg) : grokAvailable();
}

export function callBriefModel(prompt, cfg = {}, onThink) {
  if (currentProvider(cfg) === "opencode") return callOpenCode(prompt, cfg);
  return callGrok(prompt, onThink);
}
