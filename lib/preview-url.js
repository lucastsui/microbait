export const X_PREVIEW_PARTITION = "persist:microbait-x";
export const WEB_PREVIEW_PARTITION = "persist:microbait-preview";
export const LINKEDIN_LOGIN_URL = "https://www.linkedin.com/login";

export function linkedInHostname(raw) {
  try {
    return new URL(String(raw || "")).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function previewUrl(raw) {
  try {
    const u = new URL(String(raw || ""));
    if (u.protocol !== "https:") return "";
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "x.com" || host === "twitter.com") return u.href;
    if ((host === "linkedin.com" || host.endsWith(".linkedin.com")) && /\/jobs\//.test(u.pathname)) return u.href;
    return "";
  } catch {
    return "";
  }
}

export function isLinkedInHost(raw) {
  const host = linkedInHostname(raw);
  return host === "linkedin.com" || host.endsWith(".linkedin.com");
}

export function isLinkedInAuthUrl(raw) {
  if (!isLinkedInHost(raw)) return false;
  try {
    const path = new URL(raw).pathname.toLowerCase();
    return /\/(login|uas\/|checkpoint|challenge|signup|authwall|oauth|lite\/login|sales\/login|two-step|two_step|captcha|security-verification|device-verification)/.test(
      path,
    );
  } catch {
    return false;
  }
}

export function isLinkedInSessionCookie(cookie) {
  const name = String(cookie?.name || "");
  const host = String(cookie?.domain || "")
    .replace(/^\./, "")
    .toLowerCase();
  if (!(host === "linkedin.com" || host.endsWith(".linkedin.com"))) return false;
  return name === "li_at" || name === "liap";
}

export function hasLinkedInSessionCookies(cookies) {
  return (cookies || []).some((cookie) => isLinkedInSessionCookie(cookie));
}

export function isLoginPopupUrl(raw) {
  try {
    const host = new URL(String(raw || "")).hostname.replace(/^www\./, "").toLowerCase();
    return (
      host === "accounts.google.com" ||
      host === "appleid.apple.com" ||
      host === "login.microsoftonline.com" ||
      host.endsWith(".okta.com")
    );
  } catch {
    return false;
  }
}

export function linkedInJobId(raw) {
  if (!isLinkedInHost(raw)) return "";
  try {
    const match = new URL(raw).pathname.match(/\/jobs\/view\/(?:[\w-]+-)?(\d+)/i);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

export function isOnLinkedInJob(current, target) {
  const want = linkedInJobId(target);
  return Boolean(want && linkedInJobId(current) === want);
}

export function shouldReturnToLinkedInJob(current, target, { signedIn = false } = {}) {
  const want = linkedInJobId(target);
  if (!want) return false;
  if (isOnLinkedInJob(current, target)) return false;
  if (isLinkedInAuthUrl(current)) return Boolean(signedIn);
  return isLinkedInHost(current);
}

export function previewPartition(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "x.com" || host === "twitter.com") return X_PREVIEW_PARTITION;
  } catch {
    // fall through
  }
  return WEB_PREVIEW_PARTITION;
}
