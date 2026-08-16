import { looksLikeAd } from "./neutralize.js";

const UA = "Microbait/0.1 (neutral public digest; local reader)";
const FETCH_MS = 7000;

export function classifyGoal(goal, handles = []) {
  const g = String(goal || "").toLowerCase();
  const hasHandles = handles.filter(Boolean).length > 0;
  if (hasHandles || /\b(friends?|family|people i know|how is .+ doing)\b/.test(g)) {
    return "people";
  }
  if (/\b(tech|software|chip|ai|startup|programming|gadget|apple|google|microsoft)\b/.test(g)) {
    return "tech";
  }
  if (/\b(market|stock|economy|inflation|fed|finance)\b/.test(g)) {
    return "markets";
  }
  if (/\b(science|health|medical|climate|space|paper)\b/.test(g)) {
    return "science";
  }
  return "news";
}

const QUERY_STOP = new Set([
  "want",
  "know",
  "recent",
  "latest",
  "news",
  "week",
  "update",
  "updates",
  "doing",
  "friends",
  "family",
  "public",
  "should",
  "actually",
  "about",
  "what",
  "happened",
  "this",
  "that",
  "from",
  "with",
  "have",
  "tech",
  "technology",
  "development",
  "world",
]);

export function queryTerms(goal) {
  return String(goal || "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 3 && !QUERY_STOP.has(w))
    .slice(0, 8)
    .join(" ");
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json, application/rss+xml, text/xml, */*" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return { contentType: res.headers.get("content-type") || "", text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

function decodeXml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRss(xml, outlet) {
  const items = [];
  const chunks = String(xml || "").split(/<item[\s>]/i).slice(1);
  for (const chunk of chunks.slice(0, 12)) {
    const title = decodeXml((chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const link = decodeXml((chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || "");
    const desc = decodeXml(
      (chunk.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || "",
    );
    if (!title) continue;
    if (looksLikeAd(`${title} ${desc}`)) continue;
    items.push({
      title,
      text: desc.slice(0, 600),
      url: link,
      outlet,
      source: "rss",
    });
  }
  return items;
}

export async function fetchRssFeed(url, outlet) {
  const { text } = await fetchText(url);
  return parseRss(text, outlet);
}

export async function fetchHackerNews(goal) {
  const q = queryTerms(goal);
  const url = q
    ? `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=8&query=${encodeURIComponent(q)}`
    : "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=8";
  const { text } = await fetchText(url);
  const data = JSON.parse(text);
  return (data.hits || [])
    .filter((h) => h.title && (h.url || h.objectID))
    .filter((h) => !looksLikeAd(h.title))
    .map((h) => ({
      title: h.title,
      text: h.title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      outlet: "Hacker News",
      source: "hn",
    }));
}

export async function fetchReddit(subreddit) {
  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=8&raw_json=1`;
  const { text } = await fetchText(url);
  const data = JSON.parse(text);
  const children = data?.data?.children || [];
  return children
    .map((c) => c.data)
    .filter((d) => d && d.title && !d.stickied && !d.over_18)
    .filter((d) => d.post_hint !== "ad" && !looksLikeAd(d.title))
    .map((d) => ({
      title: d.title,
      text: String(d.selftext || d.title).slice(0, 600),
      url: d.url_overridden_by_dest || `https://www.reddit.com${d.permalink}`,
      outlet: `r/${subreddit}`,
      source: "reddit",
    }));
}

const FEEDS = {
  tech: [
    ["https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=8", "hn-front"],
    ["https://www.theverge.com/rss/index.xml", "The Verge"],
    ["https://feeds.arstechnica.com/arstechnica/index", "Ars Technica"],
  ],
  news: [
    ["https://feeds.bbci.co.uk/news/rss.xml", "BBC"],
    ["https://rss.nytimes.com/services/xml/rss/nyt/World.xml", "NYT World"],
  ],
  science: [
    ["https://www.sciencedaily.com/rss/all.xml", "ScienceDaily"],
    ["https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=8&query=science", "hn-science"],
  ],
  markets: [
    ["https://feeds.bbci.co.uk/news/business/rss.xml", "BBC Business"],
  ],
  people: [],
};

export async function collectPublicSources(goal, handles = []) {
  const kind = classifyGoal(goal, handles);
  const consulted = [];
  const found = [];
  const notes = [];

  const jobs = [];

  if (kind !== "people") {
    jobs.push(
      fetchHackerNews(goal)
        .then((rows) => {
          consulted.push("Hacker News");
          found.push(...rows);
        })
        .catch(() => notes.push("Hacker News was unreachable.")),
    );
  }

  const feedList = FEEDS[kind] || FEEDS.news;
  for (const [url, outlet] of feedList) {
    if (outlet.startsWith("hn")) continue;
    jobs.push(
      fetchRssFeed(url, outlet)
        .then((rows) => {
          consulted.push(outlet);
          found.push(...rows);
        })
        .catch(() => notes.push(`${outlet} was unreachable.`)),
    );
  }

  if (kind === "tech") {
    jobs.push(
      fetchReddit("technology")
        .then((rows) => {
          consulted.push("r/technology");
          found.push(...rows);
        })
        .catch(() => notes.push("Reddit was unreachable.")),
    );
  }

  await Promise.all(jobs);

  if (kind === "people") {
    notes.push(
      "Private friend feeds (Facebook, Instagram, locked accounts) are not readable without those logins. Add public X usernames, or set an XAI_API_KEY so Grok can search public posts.",
    );
    if (handles.length) {
      notes.push(
        `Saved public handles: ${handles.map((h) => "@" + h).join(", ")}. Live X search runs when a SpaceXAI key is present.`,
      );
    }
  }

  const seen = new Set();
  const unique = [];
  for (const row of found) {
    const key = (row.url || row.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }

  return {
    kind,
    sources: unique.slice(0, 20),
    consulted: [...new Set(consulted)],
    notes,
  };
}
