import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { composeBriefing } from "./lib/digest.js";
import { addGoal, listGoals, removeGoal } from "./lib/store.js";
import { hasXaiKey, xaiModel } from "./lib/xai.js";

loadDotEnv();

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(ROOT, "public");
const PORT = Number(process.env.PORT || 3847);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

const hits = new Map();

function loadDotEnv() {
  const path = fileURLToPath(new URL("./.env", import.meta.url));
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function send(res, status, body, headers = {}) {
  const payload = Buffer.from(body);
  res.writeHead(status, {
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(payload);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8" });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function rateLimit(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const row = hits.get(ip) || [];
  const recent = row.filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length <= 20;
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/app") pathname = "/app.html";
  const safe = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const file = join(PUBLIC, safe);
  if (!file.startsWith(PUBLIC)) {
    send(res, 403, "Forbidden");
    return;
  }
  if (!existsSync(file)) {
    send(res, 404, "Not found");
    return;
  }
  const type = MIME[extname(file)] || "application/octet-stream";
  send(res, 200, readFileSync(file), { "Content-Type": type });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      sendJson(res, 200, {
        ok: true,
        live: hasXaiKey(),
        model: hasXaiKey() ? xaiModel() : null,
        mode: hasXaiKey() ? "grok" : "local",
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/goals") {
      sendJson(res, 200, { goals: await listGoals() });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/goals") {
      const body = await readJson(req);
      const goal = await addGoal(body);
      sendJson(res, 201, { goal });
      return;
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/api/goals/")) {
      const id = url.pathname.slice("/api/goals/".length);
      const ok = await removeGoal(id);
      sendJson(res, ok ? 200 : 404, { ok });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/brief") {
      const ip = req.socket.remoteAddress || "local";
      if (!rateLimit(ip)) {
        sendJson(res, 429, { error: "Too many briefings in a minute. Wait, then ask again." });
        return;
      }
      const body = await readJson(req);
      const briefing = await composeBriefing({
        goal: body.goal,
        handles: body.handles,
        prefer: body.prefer,
      });
      sendJson(res, 200, { briefing });
      return;
    }
    if (req.method === "GET") {
      serveStatic(req, res, url);
      return;
    }
    send(res, 405, "Method not allowed");
  } catch (err) {
    sendJson(res, 400, { error: err.message || "Request failed" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Microbait http://127.0.0.1:${PORT}`);
});
