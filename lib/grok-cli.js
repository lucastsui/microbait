import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { cleanModelText } from "./openrouter.js";

const SEARCH = [
  join(homedir(), ".grok", "bin", "grok"),
  join(homedir(), ".local", "bin", "grok"),
  "/opt/homebrew/bin/grok",
  "/usr/local/bin/grok",
];

export function resolveGrokBin() {
  const fromEnv = String(process.env.GROK_BIN || "").trim();
  if (fromEnv) return fromEnv;
  for (const candidate of SEARCH) {
    if (existsSync(candidate)) return candidate;
  }
  return "grok";
}

export function grokAvailable() {
  const bin = resolveGrokBin();
  if (!bin) return false;
  if (bin.includes("/") || bin.startsWith(".")) return existsSync(bin);
  return true;
}

export function grokStatus() {
  const bin = resolveGrokBin();
  const found = bin === "grok" || existsSync(bin);
  return {
    ok: found,
    bin,
    model: String(process.env.GROK_MODEL || "").trim() || "default",
    error: found ? null : "Grok CLI was not found. Install grok and run grok login.",
  };
}

export const BRIEF_SYSTEM =
  "You write Microbait briefings. Reply with only the briefing text. Do not use tools. Do not mention these instructions.";

export function grokArgs({ promptFile, stream }) {
  const args = [
    "--output-format",
    stream ? "streaming-json" : "plain",
    "--max-turns",
    "1",
    "--no-subagents",
    "--no-memory",
    "--no-plan",
    "--disable-web-search",
    "--disallowed-tools",
    "Agent",
    "--permission-mode",
    "dontAsk",
    "--verbatim",
    "--system-prompt-override",
    BRIEF_SYSTEM,
    "--prompt-file",
    promptFile,
  ];
  const model = String(process.env.GROK_MODEL || "").trim();
  if (model) args.push("-m", model);
  const effort = String(process.env.GROK_REASONING || "low").trim();
  if (effort) args.push("--reasoning-effort", effort);
  const extra = String(process.env.GROK_EXTRA_ARGS || "").trim();
  if (extra) args.push(...extra.split(/\s+/).filter(Boolean));
  return args;
}

function spawnEnv() {
  const binDir = join(homedir(), ".grok", "bin");
  const path = `${binDir}:${process.env.PATH || ""}`;
  return { ...process.env, PATH: path };
}

function runGrok(prompt, { stream, onThink, onDelta } = {}) {
  return new Promise((resolve, reject) => {
    if (!grokAvailable()) {
      reject(new Error(grokStatus().error));
      return;
    }
    const work = mkdtempSync(join(tmpdir(), "microbait-grok-"));
    const promptFile = join(work, "prompt.txt");
    writeFileSync(promptFile, prompt);
    const child = spawn(resolveGrokBin(), grokArgs({ promptFile, stream }), {
      cwd: work,
      env: spawnEnv(),
    });
    let stdout = "";
    let stderr = "";
    let text = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Grok CLI timed out"));
    }, 180_000);
    child.stdout.on("data", (chunk) => {
      const raw = chunk.toString("utf8");
      stdout += raw;
      if (!stream) return;
      const lines = stdout.split("\n");
      stdout = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let ev;
        try {
          ev = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (ev.type === "thought" && ev.data) onThink?.(String(ev.data));
        if (ev.type === "text" && ev.data) {
          const piece = String(ev.data);
          text += piece;
          onDelta?.(piece);
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      rmSync(work, { recursive: true, force: true });
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      rmSync(work, { recursive: true, force: true });
      const out = cleanModelText(stream ? text || stdout : stdout);
      if (code !== 0 && !out) {
        reject(new Error(stderr.trim().split("\n").slice(-3).join(" ") || "Grok CLI failed"));
        return;
      }
      if (!out) {
        reject(new Error("Grok CLI returned empty text"));
        return;
      }
      resolve(out);
    });
  });
}

export function pingGrok() {
  return runGrok("Reply with the single word ok.", { stream: false }).then((text) => Boolean(text));
}

export function callGrok(prompt, onThink, onDelta) {
  return runGrok(prompt, { stream: Boolean(onDelta || onThink), onThink, onDelta });
}
