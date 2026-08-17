import { execFileSync } from "node:child_process";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_ROOT = join(homedir(), "Library/Application Support/Google/Chrome");

function keychainPassword() {
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-w", "-s", "Chrome Safe Storage", "-a", "Chrome"],
      { encoding: "utf8", timeout: 8000 },
    ).trim();
  } catch {
    return "";
  }
}

function decryptValue(encrypted, password) {
  if (!encrypted || !encrypted.length) return "";
  const buf = Buffer.isBuffer(encrypted) ? encrypted : Buffer.from(encrypted);
  if (buf.length <= 3) return "";
  const prefix = buf.subarray(0, 3).toString("utf8");
  if (prefix !== "v10" && prefix !== "v11") return "";
  const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
  const iv = Buffer.alloc(16, " ");
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(true);
  try {
    const plain = Buffer.concat([decipher.update(buf.subarray(3)), decipher.final()]);
    // Chrome cookie DB v24+ prepends sha256(domain) to the plaintext.
    const value = plain.length > 32 ? plain.subarray(32) : plain;
    const text = value.toString("utf8");
    if (text.includes("\uFFFD")) return "";
    return text;
  } catch {
    return "";
  }
}

function isXHost(domain) {
  const host = String(domain || "").toLowerCase().replace(/^\./, "");
  return host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com");
}

function cookieFiles() {
  return ["Default", "Profile 1", "Profile 2"]
    .map((profile) => join(CHROME_ROOT, profile, "Cookies"))
    .filter((file) => existsSync(file));
}

function readRows(file) {
  const dir = mkdtempSync(join(tmpdir(), "microbait-ck-"));
  const copy = join(dir, "Cookies");
  try {
    copyFileSync(file, copy);
    const sql =
      "SELECT host_key, name, hex(encrypted_value) AS encrypted_value, path, is_secure, is_httponly, expires_utc " +
      "FROM cookies WHERE host_key LIKE '%x.com' OR host_key LIKE '%.x.com' OR host_key LIKE '%twitter.com';";
    const raw = execFileSync("sqlite3", ["-json", copy, sql], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    return raw.trim() ? JSON.parse(raw) : [];
  } catch {
    return [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function hasChromeXSession(cookies) {
  return (cookies || []).some((c) => c.name === "auth_token");
}

export const X_LOGIN_URL = "https://x.com/i/flow/login";

export function chromeLoginScript(url = X_LOGIN_URL) {
  const safe = String(url).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return [
    'tell application "Google Chrome"',
    "  activate",
    "  if (count of windows) = 0 then",
    "    make new window",
    `    set URL of active tab of front window to "${safe}"`,
    "  else",
    "    tell front window",
    `      make new tab with properties {URL:"${safe}"}`,
    "    end tell",
    "  end if",
    "end tell",
  ].join("\n");
}

export function readChromeXCookies() {
  const password = keychainPassword();
  if (!password) return [];
  const seen = new Set();
  const out = [];
  for (const file of cookieFiles()) {
    for (const row of readRows(file)) {
      if (!isXHost(row.host_key)) continue;
      const value = decryptValue(Buffer.from(String(row.encrypted_value || ""), "hex"), password);
      if (!value) continue;
      const key = `${row.host_key}\t${row.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const expires = Number(row.expires_utc) || 0;
      out.push({
        name: row.name,
        value,
        domain: row.host_key.startsWith(".") ? row.host_key : `.${String(row.host_key).replace(/^\./, "")}`,
        path: row.path || "/",
        secure: Boolean(Number(row.is_secure)),
        httpOnly: Boolean(Number(row.is_httponly)),
        expirationDate: expires > 0 ? Math.floor(expires / 1_000_000 - 11644473600) : undefined,
      });
    }
  }
  return out;
}

export function openChromeToX() {
  try {
    execFileSync("osascript", ["-e", chromeLoginScript()], { timeout: 8000 });
    return;
  } catch {
    // Chrome may not accept AppleScript; fall back to open(1).
  }
  execFileSync("open", ["-a", "Google Chrome", X_LOGIN_URL], { timeout: 8000 });
}

export async function screenNameFromCookies(cookies) {
  const twid = (cookies || []).find((c) => c.name === "twid")?.value || "";
  const userId = decodeURIComponent(twid).match(/u=(\d+)/)?.[1];
  if (!userId) return "";
  const header = cookies
    .filter((c) => isXHost(c.domain))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  try {
    const res = await fetch(`https://x.com/i/user/${userId}`, {
      headers: {
        cookie: header,
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        accept: "text/html",
      },
    });
    const html = await res.text();
    const match = html.match(/"screen_name":"([A-Za-z0-9_]{1,15})"/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}
