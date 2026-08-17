export const READ_HANDLE_JS = `(() => {
  const reserved = new Set([
    "home", "explore", "search", "settings", "i", "compose", "messages",
    "notifications", "login", "logout", "tos", "privacy", "intent", "share",
    "hashtag", "about", "download", "jobs", "signup", "x",
  ]);
  const fromHref = (href) => {
    if (!href) return "";
    try {
      const u = href.startsWith("http") ? new URL(href) : new URL(href, location.origin);
      const part = u.pathname.split("/").filter(Boolean)[0] || "";
      if (!/^[A-Za-z0-9_]{1,15}$/.test(part)) return "";
      if (reserved.has(part.toLowerCase())) return "";
      return part;
    } catch {
      return "";
    }
  };
  for (const sel of [
    '[data-testid="AppTabBar_Profile_Link"]',
    'a[aria-label="Profile"]',
    'nav a[aria-label*="Profile" i]',
    'a[data-testid="DashButton_ProfileIcon_Link"]',
  ]) {
    const el = document.querySelector(sel);
    const h = fromHref(el && el.getAttribute("href"));
    if (h) return h;
  }
  const html = document.documentElement.innerHTML;
  const preferred = html.match(/"screen_name":"([A-Za-z0-9_]{1,15})","name":/);
  if (preferred && !reserved.has(preferred[1].toLowerCase())) return preferred[1];
  return "";
})()`;

export const EXPAND_JS = `(() => {
  const clicked = new Set();
  const click = (el) => {
    if (!el || clicked.has(el)) return;
    clicked.add(el);
    try { el.click(); } catch {}
  };
  for (const el of document.querySelectorAll(
    '[data-testid="tweet-text-show-more-link"], [data-testid="tweet-text-show-more-button"]',
  )) {
    click(el);
  }
  for (const el of document.querySelectorAll('article[data-testid="tweet"] [role="button"]')) {
    const t = (el.innerText || "").replace(/\\s+/g, " ").trim();
    if (/^Show more\\b/i.test(t)) click(el);
  }
  return true;
})()`;

export const HARVEST_JS = `(() => {
  const posts = [];
  const seen = new Set();
  for (const art of document.querySelectorAll('article[data-testid="tweet"]')) {
    const textEl = art.querySelector('[data-testid="tweetText"]');
    const text = textEl ? (textEl.innerText || "").trim() : "";
    if (!text) continue;
    let handle = "";
    let statusId = "";
    for (const a of art.querySelectorAll('a[href*="/status/"]')) {
      const href = a.getAttribute("href") || "";
      const m = href.match(/\\/([A-Za-z0-9_]+)\\/status\\/(\\d+)/);
      if (m) {
        handle = m[1];
        statusId = m[2];
        break;
      }
    }
    const nameBox = art.querySelector('[data-testid="User-Name"]');
    const name = nameBox ? (nameBox.innerText || "").split("\\n")[0].trim() : handle;
    const key = statusId || text.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    posts.push({
      author: name || handle || "Unknown",
      handle,
      text,
      url: handle && statusId ? "https://x.com/" + handle + "/status/" + statusId : "https://x.com/home",
    });
  }
  return posts;
})()`;