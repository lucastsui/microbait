import { session } from "electron";
import { loadConfig, saveConfig } from "../lib/config.js";
import {
  hasLinkedInSessionCookies,
  isLinkedInHost,
  WEB_PREVIEW_PARTITION,
} from "../lib/preview-url.js";

export const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

export function linkedInSession() {
  const ses = session.fromPartition(WEB_PREVIEW_PARTITION);
  ses.setUserAgent(CHROME_UA);
  return ses;
}

export async function hasLinkedInSession() {
  const cookies = await linkedInSession().cookies.get({});
  return hasLinkedInSessionCookies(cookies);
}

function persistLinkedIn(ok) {
  const cfg = loadConfig();
  if (ok) cfg.linkedin = true;
  else delete cfg.linkedin;
  saveConfig(cfg);
}

export async function linkedInStatus() {
  const ok = await hasLinkedInSession();
  persistLinkedIn(ok);
  return { ok };
}

function cookieUrl(cookie) {
  const host = String(cookie.domain || "").replace(/^\./, "");
  if (!host) return "";
  const path = cookie.path || "/";
  return `https://${host}${path}`;
}

export async function disconnectLinkedIn() {
  const ses = linkedInSession();
  const cookies = await ses.cookies.get({});
  for (const cookie of cookies) {
    const url = cookieUrl(cookie);
    if (!url || !isLinkedInHost(url)) continue;
    try {
      await ses.cookies.remove(url, cookie.name);
    } catch {
      // skip a cookie Electron will not drop
    }
  }
  try {
    await ses.clearStorageData({ origin: "https://www.linkedin.com" });
    await ses.clearStorageData({ origin: "https://linkedin.com" });
  } catch {
    // older Electron builds may ignore origin
  }
  persistLinkedIn(false);
  return { ok: true };
}
