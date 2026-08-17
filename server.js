import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isReady, loadConfig, saveConfig } from "./lib/config.js";
import { loadDotEnv } from "./lib/dotenv.js";
import { joinBrief, postLinks, splitBrief } from "./lib/brief-format.js";
import { searchJobAds } from "./lib/job-search.js";
import { extractUpSkills, summarizePrompt, trimBriefPreamble } from "./lib/brief-prompt.js";
import {
  callBriefModel,
  currentProvider,
  normalizeProvider,
  providerAvailable,
  providerStatus,
} from "./lib/brief-ai.js";
import { grokAvailable, grokStatus } from "./lib/grok-cli.js";
import { openCodeStatus } from "./lib/opencode.js";

loadDotEnv(fileURLToPath(new URL("./.env", import.meta.url)));

let xNative = null;
let linkedInNative = null;

export function setXNative(api) {
  xNative = api;
}

export function setLinkedInNative(api) {
  linkedInNative = api;
}

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(ROOT, "public");
const PORT = Number(process.env.PORT || 3847);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(res, status, body, headers = {}) {
  const payload = Buffer.from(body);
  res.writeHead(status, { "Content-Length": payload.length, "Cache-Control": "no-store", ...headers });
  res.end(payload);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8" });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function safeFile(root, pathname) {
  const file = join(root, normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, ""));
  if (!file.startsWith(root) || !existsSync(file)) return null;
  return file;
}

function serveStatic(res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const file = pathname.startsWith("/lib/") ? safeFile(ROOT, pathname) : safeFile(PUBLIC, pathname);
  if (!file) {
    send(res, 404, "Not found");
    return;
  }
  send(res, 200, readFileSync(file), { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/status") {
      const cfg = loadConfig();
      const linkedin = linkedInNative?.status
        ? Boolean((await linkedInNative.status()).ok)
        : Boolean(cfg.linkedin);
      sendJson(res, 200, {
        ready: isReady(cfg),
        x: cfg.x_username || null,
        linkedin,
        hasKey: providerAvailable(cfg),
        provider: currentProvider(cfg),
        ai: providerStatus(cfg),
        grok: grokStatus(),
        opencode: openCodeStatus(cfg),
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/connect-x") {
      if (!xNative?.connectX) {
        sendJson(res, 200, { ok: false, error: "Open the Microbait app to connect X." });
        return;
      }
      sendJson(res, 200, await xNative.connectX());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/connect-linkedin") {
      if (!linkedInNative?.connect) {
        sendJson(res, 200, { ok: false, error: "Open the Microbait app to connect LinkedIn." });
        return;
      }
      sendJson(res, 200, await linkedInNative.connect());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/disconnect-linkedin") {
      if (linkedInNative?.disconnect) {
        sendJson(res, 200, await linkedInNative.disconnect());
        return;
      }
      const cfg = loadConfig();
      delete cfg.linkedin;
      saveConfig(cfg);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/disconnect-x") {
      if (xNative?.disconnectX) {
        sendJson(res, 200, await xNative.disconnectX());
        return;
      }
      const cfg = loadConfig();
      delete cfg.x_username;
      saveConfig(cfg);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/key") {
      sendJson(res, 200, {
        ok: grokAvailable(),
        error: grokAvailable() ? undefined : grokStatus().error,
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/ai") {
      const body = await readJson(req);
      const cfg = loadConfig();
      cfg.ai = normalizeProvider(body.provider ?? cfg.ai);
      if (Object.prototype.hasOwnProperty.call(body, "opencode_key")) {
        const key = String(body.opencode_key || "").trim();
        if (key) cfg.opencode_key = key;
        else delete cfg.opencode_key;
      }
      if (Object.prototype.hasOwnProperty.call(body, "opencode_url")) {
        const nextUrl = String(body.opencode_url || "").trim();
        if (nextUrl) cfg.opencode_url = nextUrl;
        else delete cfg.opencode_url;
      }
      if (Object.prototype.hasOwnProperty.call(body, "opencode_model")) {
        const nextModel = String(body.opencode_model || "").trim();
        if (nextModel) cfg.opencode_model = nextModel;
        else delete cfg.opencode_model;
      }
      saveConfig(cfg);
      sendJson(res, 200, {
        ok: providerAvailable(cfg),
        provider: currentProvider(cfg),
        ai: providerStatus(cfg),
        error: providerAvailable(cfg) ? undefined : providerStatus(cfg).error,
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/brief") {
      const body = await readJson(req);
      const goal = String(body.goal || "").trim();
      const cfg = loadConfig();
      const wantsStream = String(req.headers.accept || "").includes("text/event-stream");
      if (!cfg.x_username) {
        sendJson(res, 200, { ok: false, error: "Connect X first." });
        return;
      }
      if (!providerAvailable(cfg)) {
        sendJson(res, 200, { ok: false, error: providerStatus(cfg).error || "AI is not available." });
        return;
      }
      const emit = wantsStream
        ? (event, data) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          }
        : null;
      if (wantsStream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
      }
      let posts = Array.isArray(body.posts) ? body.posts : [];
      if (!posts.length && xNative?.readXFeed) {
        emit?.("think", { text: "Opening your X home timeline." });
        const feed = await xNative.readXFeed({
          onProgress: (text) => emit?.("think", { text }),
        });
        if (!feed.ok) {
          if (wantsStream) {
            emit("done", { ok: false, error: feed.error || "Could not read X." });
            res.end();
            return;
          }
          sendJson(res, 200, { ok: false, error: feed.error || "Could not read X." });
          return;
        }
        posts = feed.posts || [];
      }
      if (!posts.length) {
        if (wantsStream) {
          emit("done", { ok: false, error: "No posts from X." });
          res.end();
          return;
        }
        sendJson(res, 200, { ok: false, error: "No posts from X." });
        return;
      }
      const ai = providerStatus(cfg);
      emit?.("think", {
        text: `Read ${posts.length} posts. Asking ${ai.label} to write the briefing.`,
      });
      const links = postLinks(posts);
      emit?.("posts", { posts: links });
      const draft = trimBriefPreamble(
        await callBriefModel(
          summarizePrompt(posts, goal),
          cfg,
          wantsStream ? (thought) => emit("think", { text: thought }) : undefined,
        ),
      );
      const { items } = splitBrief(draft);
      if (!items.length) {
        const msg = `${ai.label} did not return any post summaries.`;
        if (wantsStream) {
          emit("done", { ok: false, error: msg });
          res.end();
          return;
        }
        sendJson(res, 200, { ok: false, error: msg });
        return;
      }
      const jobs = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const skill = extractUpSkills(item.text)[0] || "";
        emit?.("card", {
          index: i,
          text: item.text,
          jobs: null,
          status: "Looking up job ads…",
        });
        let ads = [];
        try {
          ads = skill ? await searchJobAds(skill) : [];
        } catch {
          ads = [];
        }
        const group = { skill, ads };
        jobs.push(group);
        emit?.("card", { index: i, text: item.text, jobs: [group], status: "" });
      }
      const text = joinBrief("", items);
      if (wantsStream) {
        emit("done", { ok: true, text, count: posts.length, posts: links, jobs });
        res.end();
        return;
      }
      sendJson(res, 200, { ok: true, text, count: posts.length, posts: links, jobs });
      return;
    }
    if (req.method === "GET") {
      serveStatic(res, url);
      return;
    }
    send(res, 405, "Method not allowed");
  } catch (err) {
    const msg = err.message || "Request failed";
    if (!res.headersSent) {
      sendJson(res, 400, { ok: false, error: msg });
      return;
    }
    try {
      res.write(`event: done\ndata: ${JSON.stringify({ ok: false, error: msg })}\n\n`);
      res.end();
    } catch {
      // client already gone
    }
  }
});

export function startServer(port = PORT) {
  return new Promise((resolveListen, reject) => {
    const onListening = () => resolveListen(server);
    server.once("error", (err) => {
      if (err.code !== "EADDRINUSE") {
        reject(err);
        return;
      }
      server.listen(0, "127.0.0.1", onListening);
    });
    server.listen(port, "127.0.0.1", onListening);
  });
}

const launchedDirectly =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (launchedDirectly) {
  startServer().then((s) => {
    console.log(`Microbait http://127.0.0.1:${s.address().port}`);
  });
}
