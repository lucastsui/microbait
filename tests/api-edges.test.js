import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { saveConfig } from "../lib/config.js";
import { startServer } from "../server.js";

const HOME = join(tmpdir(), `microbait-api-edges-${process.pid}`);

async function withServer(fn) {
  process.env.MICROBAIT_HOME = HOME;
  mkdirSync(HOME, { recursive: true });
  const http = await startServer(0);
  const port = http.address().port;
  const origin = `http://127.0.0.1:${port}`;
  try {
    await fn(origin);
  } finally {
    await new Promise((resolve) => http.close(resolve));
    rmSync(HOME, { recursive: true, force: true });
    delete process.env.MICROBAIT_HOME;
  }
}

async function json(origin, method, path, body) {
  const res = await fetch(`${origin}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

test("API edges match the shipped rules", async () => {
  await withServer(async (origin) => {
    saveConfig({});

    const status = await json(origin, "GET", "/api/status");
    assert.equal(status.status, 200);
    assert.equal(status.data.ready, false);
    assert.equal(status.data.x, null);
    assert.equal(status.data.linkedin, false);
    assert.equal(typeof status.data.hasKey, "boolean");
    assert.ok(status.data.grok);
    assert.equal(status.data.provider, "grok");
    assert.ok(status.data.opencode);
    assert.ok(status.data.ai);

    const connect = await json(origin, "POST", "/api/connect-x");
    assert.equal(connect.data.ok, false);
    assert.match(String(connect.data.error), /Microbait app/i);

    const connectLi = await json(origin, "POST", "/api/connect-linkedin");
    assert.equal(connectLi.data.ok, false);
    assert.match(String(connectLi.data.error), /Microbait app/i);

    const briefNoX = await json(origin, "POST", "/api/brief", { goal: "hi" });
    assert.equal(briefNoX.data.ok, false);
    assert.match(String(briefNoX.data.error), /Connect X first/i);

    const prevBin = process.env.GROK_BIN;
    process.env.GROK_BIN = "/nonexistent/grok";
    saveConfig({ x_username: "Ada_Lovelace" });
    const briefNoGrok = await json(origin, "POST", "/api/brief", { goal: "hi" });
    assert.equal(briefNoGrok.data.ok, false);
    assert.match(String(briefNoGrok.data.error), /Grok CLI/i);
    if (prevBin === undefined) delete process.env.GROK_BIN;
    else process.env.GROK_BIN = prevBin;

    saveConfig({ x_username: "Ada_Lovelace", ai: "opencode" });
    const briefNoOpenCode = await json(origin, "POST", "/api/brief", { goal: "hi" });
    assert.equal(briefNoOpenCode.data.ok, false);
    assert.match(String(briefNoOpenCode.data.error), /OpenCode/i);

    const saved = await json(origin, "POST", "/api/ai", { provider: "grok" });
    assert.equal(saved.data.provider, "grok");

    saveConfig({ x_username: "Ada_Lovelace", ai: "grok" });
    const briefNoPosts = await json(origin, "POST", "/api/brief", { goal: "hi" });
    assert.equal(briefNoPosts.data.ok, false);
    assert.match(String(briefNoPosts.data.error), /No posts from X|Grok CLI/i);

    const missing = await json(origin, "GET", "/does-not-exist");
    assert.equal(missing.status, 404);
    assert.match(String(missing.data), /not found/i);

    const page = await fetch(`${origin}/`);
    const html = await page.text();
    assert.match(html, /Connect X/);
    assert.match(html, /Connect LinkedIn/);
    assert.match(html, /Disconnect/);
    assert.match(html, /Grok CLI/);
    assert.match(html, /OpenCode API/);
    const appJs = await (await fetch(`${origin}/app.js`)).text();
    assert.match(appJs, /X connected/);
    assert.match(appJs, /X not connected/);
    assert.match(appJs, /LinkedIn connected/);
    assert.match(appJs, /LinkedIn not connected/);
    assert.doesNotMatch(appJs, /Connected as @/);
    assert.match(html, /Ask Microbait/);
    assert.match(html, /id="desk" hidden/);
  });
});
