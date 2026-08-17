function decode(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function unwrapJobUrl(href) {
  if (!href) return "";
  try {
    const raw = href.startsWith("//") ? `https:${href}` : href;
    const u = new URL(raw, "https://www.linkedin.com");
    const nested = u.searchParams.get("uddg") || u.searchParams.get("u");
    const out = nested ? decodeURIComponent(nested) : u.href;
    return out.split("?")[0];
  } catch {
    return String(href).split("?")[0];
  }
}

function isJobView(url) {
  return /linkedin\.com\/jobs\/view\/.+\d{6,}/i.test(url || "");
}

function parseLinkedInGuest(html) {
  const out = [];
  const re =
    /href="(https:\/\/(?:www\.)?linkedin\.com\/jobs\/view\/[^"]+)"[\s\S]{0,1200}?base-search-card__title[^>]*>([\s\S]*?)<\/h3>[\s\S]{0,800}?base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 3) {
    const url = unwrapJobUrl(m[1].replace(/&amp;/g, "&"));
    const title = decode(m[2]);
    const company = decode(m[3]);
    if (!isJobView(url) || !title) continue;
    if (out.some((a) => a.url === url)) continue;
    out.push({ title, url, snippet: company });
  }
  return out;
}

function parseDdg(html) {
  const out = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 3) {
    const url = unwrapJobUrl(m[1].replace(/&amp;/g, "&"));
    const title = decode(m[2]);
    if (!title || !isJobView(url) || /^\d[\d,+]*\+/.test(title)) continue;
    out.push({ title, url, snippet: "" });
  }
  return out;
}

async function fetchHtml(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

export async function searchJobAds(query) {
  const q = String(query || "").replace(/^⬆️\s*/, "").trim();
  if (!q) return [];
  const guest = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(q)}&start=0`;
  const fromLi = parseLinkedInGuest(await fetchHtml(guest));
  if (fromLi.length) return fromLi;
  const ddg = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:linkedin.com/jobs ${q}`)}`;
  return parseDdg(await fetchHtml(ddg));
}

export async function jobsForSkills(skills) {
  const unique = [...new Set((skills || []).map((s) => String(s || "").replace(/^⬆️\s*/, "").trim()).filter(Boolean))];
  return Promise.all(
    unique.slice(0, 8).map(async (skill) => ({
      skill,
      ads: await searchJobAds(skill),
    })),
  );
}

export function formatJobBlocks(groups) {
  return (groups || [])
    .map((group) => {
      const lines = group.ads?.length
        ? group.ads.map((a) => `- ${a.title}${a.snippet ? ` (${a.snippet})` : ""} ${a.url || ""}`.trim())
        : ["- (no job ads found)"];
      return `SKILL: ${group.skill}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

export function adsForSkills(skills) {
  return jobsForSkills(skills).then(formatJobBlocks);
}
