import { BrowserWindow, session } from "electron";
import {
  hasChromeXSession,
  openChromeToX,
  readChromeXCookies,
  screenNameFromCookies,
} from "../lib/chrome-x-cookies.js";
import { loadConfig, realHandle, saveConfig } from "../lib/config.js";
import { EXPAND_JS, HARVEST_JS, READ_HANDLE_JS } from "../lib/x-dom.js";

export const X_PARTITION = "persist:microbait-x";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

let loginWin = null;

function xSession() {
  const ses = session.fromPartition(X_PARTITION);
  ses.setUserAgent(UA);
  return ses;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createXWindow({ show }) {
  const win = new BrowserWindow({
    width: 1100,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    title: "X",
    show,
    backgroundColor: "#000000",
    webPreferences: {
      partition: X_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setUserAgent(UA);
  win.webContents.setWindowOpenHandler(() => ({
    action: "allow",
    overrideBrowserWindowOptions: {
      parent: show ? win : undefined,
      webPreferences: {
        partition: X_PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    },
  }));
  return win;
}

async function pageHandle(contents) {
  if (!contents || contents.isDestroyed()) return "";
  try {
    const raw = await contents.executeJavaScript(READ_HANDLE_JS, true);
    return realHandle(raw);
  } catch {
    return "";
  }
}

async function waitForHandle(win, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (win.isDestroyed()) {
      return { ok: false, error: "The X window was closed." };
    }
    const handle = await pageHandle(win.webContents);
    if (handle) return { ok: true, username: handle };
    await sleep(1500);
  }
  return {
    ok: false,
    error: "Could not see an X login. Sign in in the X window and try Connect X again.",
  };
}

function persistUsername(username) {
  const cfg = loadConfig();
  cfg.x_username = username;
  saveConfig(cfg);
}

async function hasStoredSession() {
  return hasChromeXSession(await xSession().cookies.get({}));
}

async function importChromeCookies(cookies) {
  const ses = xSession();
  for (const cookie of cookies) {
    const host = String(cookie.domain || "").replace(/^\./, "");
    if (!host) continue;
    try {
      await ses.cookies.set({
        url: `https://${host}${cookie.path || "/"}`,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || "/",
        secure: Boolean(cookie.secure),
        httpOnly: Boolean(cookie.httpOnly),
        expirationDate: cookie.expirationDate,
      });
    } catch {
      // skip a cookie Electron will not accept
    }
  }
}

async function confirmImportedSession() {
  const hidden = createXWindow({ show: false });
  try {
    await hidden.loadURL("https://x.com/home");
    const result = await waitForHandle(hidden, 12_000);
    if (result.ok) persistUsername(result.username);
    return result;
  } catch (err) {
    return { ok: false, error: err.message || "Could not open X." };
  } finally {
    if (!hidden.isDestroyed()) hidden.close();
  }
}

async function adoptChromeCookies(cookies) {
  await importChromeCookies(cookies);
  const fromPage = realHandle(await screenNameFromCookies(cookies));
  if (fromPage) {
    persistUsername(fromPage);
    return { ok: true, username: fromPage };
  }
  return confirmImportedSession();
}

export async function connectX() {
  xSession();
  if (loginWin && !loginWin.isDestroyed()) loginWin.close();

  try {
    openChromeToX();
  } catch (err) {
    return { ok: false, error: err.message || "Could not open Google Chrome." };
  }

  if (await hasStoredSession()) {
    const existing = await confirmImportedSession();
    if (existing.ok) return existing;
  }

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const cookies = readChromeXCookies();
    if (hasChromeXSession(cookies)) {
      const result = await adoptChromeCookies(cookies);
      if (result.ok) return result;
    }
    await sleep(2000);
  }

  return {
    ok: false,
    error: "Sign in to X in Google Chrome, then click Connect X again.",
  };
}

export async function disconnectX() {
  if (loginWin && !loginWin.isDestroyed()) loginWin.close();
  await xSession().clearStorageData();
  const cfg = loadConfig();
  delete cfg.x_username;
  saveConfig(cfg);
  return { ok: true };
}

export async function readXFeed({ target = 20, scrolls = 10, onProgress } = {}) {
  const note = (msg) => {
    try {
      onProgress?.(msg);
    } catch {
      // ignore a broken listener
    }
  };
  const hidden = createXWindow({ show: false });
  try {
    hidden.webContents.setBackgroundThrottling(false);
    note("Opening your X home timeline.");
    await hidden.loadURL("https://x.com/home");
    const ready = await waitForHandle(hidden, 25_000);
    if (!ready.ok) {
      return { ok: false, error: ready.error || "Sign in to X again." };
    }
    note("Looking through the posts you would have seen.");
    const posts = [];
    const seen = new Set();
    for (let i = 0; i < Math.max(1, scrolls); i += 1) {
      await hidden.webContents.executeJavaScript(EXPAND_JS, true);
      await sleep(400);
      const batch = (await hidden.webContents.executeJavaScript(HARVEST_JS, true)) || [];
      for (const post of batch) {
        const key = post.url || String(post.text || "").slice(0, 80);
        if (seen.has(key)) continue;
        seen.add(key);
        posts.push(post);
        if (posts.length >= target) break;
      }
      note(`Read ${posts.length} posts so far.`);
      if (posts.length >= target) break;
      await hidden.webContents.executeJavaScript("window.scrollBy(0, 1800)");
      await sleep(1500);
    }
    return { ok: true, posts, username: ready.username };
  } catch (err) {
    return { ok: false, error: err.message || "Could not read x.com." };
  } finally {
    if (!hidden.isDestroyed()) hidden.close();
  }
}

export function closeXWindows() {
  if (loginWin && !loginWin.isDestroyed()) loginWin.close();
}