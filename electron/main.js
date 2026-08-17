import { app, BrowserView, BrowserWindow, ipcMain, shell } from "electron";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "../lib/dotenv.js";
import {
  isLinkedInHost,
  isLinkedInSessionCookie,
  isLoginPopupUrl,
  isOnLinkedInJob,
  LINKEDIN_LOGIN_URL,
  previewPartition,
  previewUrl,
  shouldReturnToLinkedInJob,
  WEB_PREVIEW_PARTITION,
} from "../lib/preview-url.js";
import { setLinkedInNative, setXNative, startServer } from "../server.js";

loadDotEnv(fileURLToPath(new URL("../.env", import.meta.url)));
import { CHROME_UA, disconnectLinkedIn, hasLinkedInSession, linkedInSession, linkedInStatus } from "./linkedin.js";
import { closeXWindows, connectX, disconnectX, readXFeed } from "./x.js";

const CDP_PORT = String(process.env.MICROBAIT_CDP || "9222");
app.commandLine.appendSwitch("remote-debugging-port", CDP_PORT);
app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");

let win;
let drawerView = null;
let drawerPartition = "";
let drawerTarget = "";
let drawerReturnTimer = null;
let drawerReturnPoll = null;
let drawerSignedIn = false;
let drawerOnJobSince = 0;
let drawerSettled = false;
let drawerBounces = 0;
let drawerLastBox = null;
const LINKEDIN_BOUNCE_DELAY_MS = 1200;
const LINKEDIN_SETTLE_MS = 2000;
const LINKEDIN_MAX_BOUNCES = 8;
const PRELOAD = fileURLToPath(new URL("./preload.cjs", import.meta.url));

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

function bindIpc() {
  ipcMain.handle("x:connect", async () => {
    try {
      return await connectX();
    } catch (err) {
      return { ok: false, error: err.message || "Could not connect." };
    }
  });
  ipcMain.handle("x:disconnect", async () => {
    try {
      return await disconnectX();
    } catch (err) {
      return { ok: false, error: err.message || "Could not disconnect." };
    }
  });
  ipcMain.handle("x:feed", async () => {
    try {
      return await readXFeed();
    } catch (err) {
      return { ok: false, error: err.message || "Could not read X." };
    }
  });
  ipcMain.handle("drawer:open", async (_event, raw) => {
    try {
      return await openDrawer(raw);
    } catch (err) {
      return { ok: false, error: err.message || "Could not open the link." };
    }
  });
  ipcMain.handle("drawer:bounds", async (_event, box) => {
    placeDrawer(box);
    return { ok: true };
  });
  ipcMain.handle("drawer:close", async () => {
    destroyDrawer();
    return { ok: true };
  });
  ipcMain.handle("linkedin:status", async () => {
    try {
      return await linkedInStatus();
    } catch (err) {
      return { ok: false, error: err.message || "Could not check LinkedIn." };
    }
  });
  ipcMain.handle("linkedin:connect", async () => {
    try {
      return await connectLinkedIn();
    } catch (err) {
      return { ok: false, error: err.message || "Could not connect LinkedIn." };
    }
  });
  ipcMain.handle("linkedin:disconnect", async () => {
    try {
      return await disconnectLinkedIn();
    } catch (err) {
      return { ok: false, error: err.message || "Could not disconnect LinkedIn." };
    }
  });
}

function clearDrawerTarget() {
  if (drawerReturnTimer) {
    clearTimeout(drawerReturnTimer);
    drawerReturnTimer = null;
  }
  if (drawerReturnPoll) {
    clearInterval(drawerReturnPoll);
    drawerReturnPoll = null;
  }
  drawerTarget = "";
  drawerSignedIn = false;
  drawerOnJobSince = 0;
  drawerSettled = false;
  drawerBounces = 0;
}

function currentDrawerUrl() {
  try {
    return drawerView?.webContents.getURL() || "";
  } catch {
    return "";
  }
}

function maybeReturnToLinkedInJob(url = currentDrawerUrl(), { signedIn = drawerSignedIn } = {}) {
  if (!drawerView || drawerSettled || !drawerTarget) return;
  if (drawerBounces >= LINKEDIN_MAX_BOUNCES) return;
  const nowUrl = url || currentDrawerUrl();
  if (isOnLinkedInJob(nowUrl, drawerTarget)) {
    if (!drawerOnJobSince) drawerOnJobSince = Date.now();
    if (Date.now() - drawerOnJobSince >= LINKEDIN_SETTLE_MS) drawerSettled = true;
    return;
  }
  drawerOnJobSince = 0;
  if (signedIn) drawerSignedIn = true;
  if (!shouldReturnToLinkedInJob(nowUrl, drawerTarget, { signedIn: drawerSignedIn })) return;
  if (drawerReturnTimer) clearTimeout(drawerReturnTimer);
  drawerReturnTimer = setTimeout(() => {
    drawerReturnTimer = null;
    if (!drawerView || drawerSettled) return;
    const now = currentDrawerUrl();
    if (isOnLinkedInJob(now, drawerTarget)) {
      if (!drawerOnJobSince) drawerOnJobSince = Date.now();
      return;
    }
    if (!shouldReturnToLinkedInJob(now, drawerTarget, { signedIn: drawerSignedIn })) return;
    drawerBounces += 1;
    drawerView.webContents.loadURL(drawerTarget);
  }, LINKEDIN_BOUNCE_DELAY_MS);
}

function watchLinkedInReturn() {
  if (drawerReturnPoll) clearInterval(drawerReturnPoll);
  drawerReturnPoll = setInterval(() => {
    if (!drawerView || drawerSettled || !drawerTarget) {
      if (drawerReturnPoll) {
        clearInterval(drawerReturnPoll);
        drawerReturnPoll = null;
      }
      return;
    }
    maybeReturnToLinkedInJob(currentDrawerUrl());
  }, 1000);
}

function destroyDrawer() {
  clearDrawerTarget();
  if (!drawerView) return;
  if (win && !win.isDestroyed()) win.removeBrowserView(drawerView);
  try {
    drawerView.webContents.close();
  } catch {
    // already gone
  }
  drawerView = null;
  drawerPartition = "";
}

function hideDrawer() {
  if (!drawerView) return;
  drawerView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
}

function placeDrawer(box) {
  if (box) drawerLastBox = box;
  if (!drawerView || !drawerLastBox) return;
  const width = Math.max(0, Number(drawerLastBox.width) || 0);
  const height = Math.max(0, Number(drawerLastBox.height) || 0);
  if (!width || !height) {
    hideDrawer();
    return;
  }
  drawerView.setBounds({
    x: Math.max(0, Number(drawerLastBox.x) || 0),
    y: Math.max(0, Number(drawerLastBox.y) || 0),
    width,
    height,
  });
}

function ensureDrawer(partition) {
  if (drawerView && drawerPartition === partition) return drawerView;
  destroyDrawer();
  drawerView = new BrowserView({
    webPreferences: {
      partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  drawerPartition = partition;
  if (partition === WEB_PREVIEW_PARTITION) linkedInSession();
  drawerView.webContents.setUserAgent(CHROME_UA);
  drawerView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  if (win && !win.isDestroyed()) win.addBrowserView(drawerView);
  placeDrawer(drawerLastBox);
  drawerView.webContents.setWindowOpenHandler(({ url }) => {
    const href = previewUrl(url);
    if (href || isLinkedInHost(url)) {
      drawerView.webContents.loadURL(href || url);
      return { action: "deny" };
    }
    if (isLoginPopupUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          parent: win,
          width: 520,
          height: 740,
          webPreferences: {
            partition,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        },
      };
    }
    return { action: "deny" };
  });
  const session = drawerView.webContents.session;
  if (!session.__microbaitLiWatch) {
    session.__microbaitLiWatch = true;
    session.cookies.on("changed", (_event, cookie, _cause, removed) => {
      if (removed || !isLinkedInSessionCookie(cookie)) return;
      maybeReturnToLinkedInJob(currentDrawerUrl(), { signedIn: true });
    });
  }
  drawerView.webContents.on("did-navigate", (_event, next) => {
    maybeReturnToLinkedInJob(next);
  });
  drawerView.webContents.on("did-navigate-in-page", (_event, next, isMainFrame) => {
    if (isMainFrame) maybeReturnToLinkedInJob(next);
  });
  drawerView.webContents.on("did-frame-navigate", (_event, next, _code, _text, isMainFrame) => {
    if (isMainFrame) maybeReturnToLinkedInJob(next);
  });
  drawerView.webContents.on("did-stop-loading", () => {
    maybeReturnToLinkedInJob(currentDrawerUrl());
  });
  drawerView.webContents.on("did-finish-load", () => {
    maybeReturnToLinkedInJob(currentDrawerUrl());
  });
  return drawerView;
}

async function openDrawer(raw) {
  const href = previewUrl(raw);
  if (!href) return { ok: false, error: "That link cannot open here." };
  if (!win || win.isDestroyed()) return { ok: false, error: "The window is gone." };
  const view = ensureDrawer(previewPartition(href));
  drawerTarget = href;
  drawerSignedIn = false;
  drawerOnJobSince = 0;
  drawerSettled = false;
  drawerBounces = 0;
  if (drawerReturnTimer) {
    clearTimeout(drawerReturnTimer);
    drawerReturnTimer = null;
  }
  hideDrawer();
  if (isLinkedInHost(href)) watchLinkedInReturn();
  await view.webContents.loadURL(href);
  return { ok: true };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectLinkedIn() {
  if (await hasLinkedInSession()) {
    return linkedInStatus();
  }
  if (!win || win.isDestroyed()) return { ok: false, error: "The window is gone." };
  const view = ensureDrawer(WEB_PREVIEW_PARTITION);
  drawerTarget = "";
  drawerSettled = true;
  drawerSignedIn = false;
  placeDrawer(drawerLastBox);
  await view.webContents.loadURL(LINKEDIN_LOGIN_URL, {
    extraHeaders: "Accept-Language: en-US,en;q=0.9\n",
    userAgent: CHROME_UA,
  });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await hasLinkedInSession()) return linkedInStatus();
    await sleep(1000);
  }
  return { ok: false, error: "Sign in to LinkedIn in the panel, then click Connect LinkedIn again." };
}

async function createWindow() {
  const http = await startServer();
  const port = http.address().port;
  const origin = `http://127.0.0.1:${port}`;
  console.log(`Microbait ${origin}`);
  console.log(`Microbait CDP http://127.0.0.1:${CDP_PORT}`);

  win = new BrowserWindow({
    width: 980,
    height: 740,
    minWidth: 720,
    minHeight: 560,
    title: "Microbait",
    backgroundColor: "#f3efe6",
    show: false,
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    destroyDrawer();
    win = null;
    closeXWindows();
  });
  await win.loadURL(`${origin}/`);
  win.webContents.on("did-navigate", (_event, url) => {
    if (String(url || "").startsWith(origin)) destroyDrawer();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (previewUrl(url)) return { action: "deny" };
    openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      if (!previewUrl(url)) openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  setXNative({ connectX, disconnectX, readXFeed });
  setLinkedInNative({
    status: linkedInStatus,
    connect: connectLinkedIn,
    disconnect: disconnectLinkedIn,
  });
  bindIpc();
  return createWindow();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("window-all-closed", () => app.quit());
