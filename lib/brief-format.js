export function normalizeHandle(handle) {
  return String(handle || "")
    .trim()
    .replace(/^@/, "");
}

export function postUrl(post) {
  const handle = normalizeHandle(post?.handle || "");
  const url = String(post?.url || "").trim();
  if (/\/status\/\d+/.test(url)) return url;
  return handle ? `https://x.com/${handle}` : "";
}

export function postLinks(posts) {
  return (Array.isArray(posts) ? posts : [])
    .map((post) => {
      const handle = normalizeHandle(post.handle);
      const url = postUrl(post);
      return handle && url ? { handle, url } : null;
    })
    .filter(Boolean);
}

export function authorHref(handle, links, used) {
  const key = normalizeHandle(handle).toLowerCase();
  const list = Array.isArray(links) ? links : [];
  const taken = used instanceof Set ? used : new Set();
  const idx = list.findIndex((item, i) => !taken.has(i) && normalizeHandle(item.handle).toLowerCase() === key);
  if (idx >= 0) {
    taken.add(idx);
    return list[idx].url;
  }
  return `https://x.com/${normalizeHandle(handle)}`;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function jobListHtml(ads) {
  const list = (Array.isArray(ads) ? ads : []).filter((a) => a && a.title && a.url);
  if (!list.length) return `<p class="job-empty">No current job ads found.</p>`;
  return `<ul class="job-list">${list
    .map(
      (a) =>
        `<li><a class="job-link" href="${escapeHtml(a.url)}">${escapeHtml(a.title)}</a>${
          a.snippet ? ` <span class="job-co">${escapeHtml(a.snippet)}</span>` : ""
        }</li>`,
    )
    .join("")}</ul>`;
}

export function splitBrief(text) {
  const raw = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!raw) return { lead: "", items: [] };
  const itemRe = /(?:^Event:\s*\n)?\[@([A-Za-z0-9_]{1,32})\]:[^\n]*(?:\n(?!\[@|Event:).*)*/gm;
  const items = [];
  let m;
  while ((m = itemRe.exec(raw))) {
    items.push({ handle: m[1], text: m[0].trim() });
  }
  const eventAt = raw.search(/^Event:\s*$/m);
  const handleAt = raw.search(/^\[@/m);
  const first =
    eventAt === -1 ? handleAt : handleAt === -1 ? eventAt : Math.min(eventAt, handleAt);
  const lead = first > 0 ? raw.slice(0, first).trim() : first === 0 ? "" : raw;
  return { lead, items };
}

export function joinBrief(lead, items) {
  const parts = [];
  if (lead) parts.push(String(lead).trim());
  for (const item of items || []) {
    const block = typeof item === "string" ? item : item?.text;
    if (block) parts.push(String(block).trim());
  }
  return parts.join("\n\n");
}

export function briefHtml(text, posts, jobs) {
  const links = postLinks(posts);
  const used = new Set();
  const groups = Array.isArray(jobs) ? jobs : [];
  let upIndex = 0;
  const escaped = escapeHtml(String(text || ""));
  const linked = escaped.replace(/\[@([A-Za-z0-9_]{1,32})\]/g, (_m, handle) => {
    const href = escapeHtml(authorHref(handle, links, used));
    return `[<a class="author-link" href="${href}">@${handle}</a>]`;
  });
  const lines = linked.split("\n").filter((line) => line.trim() !== "");
  return lines
    .map((line, i) => {
      if (/^Event:$/i.test(line)) return `<span class="card-label card-event">Event:</span>`;
      if (/^Skill automated$/i.test(line)) return `<span class="card-label">Skill automated</span>`;
      if (/^New Demand$/i.test(line)) return `<span class="card-label">New Demand</span>`;
      const prev = (lines[i - 1] || "").trim();
      if (/^Event:$/i.test(prev) || /author-link/.test(line)) {
        return `<span class="card-summary">${line}</span>`;
      }
      if (/^Skill automated$/i.test(prev)) return `<span class="skill-down">${line}</span>`;
      if (/^New Demand$/i.test(prev)) {
        const ads = groups[upIndex]?.ads;
        upIndex += 1;
        if (!Array.isArray(jobs)) return `<span class="skill-up">${line}</span>`;
        return `<span class="skill-up">${line}</span>${jobListHtml(ads)}`;
      }
      if (/^⬇️/.test(line)) return `<span class="skill-down">${line}</span>`;
      if (/^⬆️/.test(line)) {
        const ads = groups[upIndex]?.ads;
        upIndex += 1;
        if (!Array.isArray(jobs)) return `<span class="skill-up">${line}</span>`;
        return `<span class="skill-up">${line}</span>${jobListHtml(ads)}`;
      }
      return line;
    })
    .join("");
}
