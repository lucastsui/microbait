import {
  ACRONYMS,
  AD_PHRASES,
  ALL_DROP_PHRASES,
  BAIT_PHRASES,
  ENGAGEMENT_PHRASES,
  SENTIMENT_PADDING,
} from "./lexicon.js";

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu;

export function normalizeHandle(handle) {
  const raw = String(handle || "")
    .trim()
    .replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,32}$/.test(raw)) return "";
  return raw;
}

export function looksLikeAd(text) {
  const lower = String(text || "").toLowerCase();
  return AD_PHRASES.some((p) => lower.includes(p));
}

export function looksLikeBait(text) {
  const lower = String(text || "").toLowerCase();
  return BAIT_PHRASES.some((p) => lower.includes(p));
}

export function stripEmojis(text) {
  return String(text || "").replace(EMOJI_RE, "");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function unshout(text) {
  return String(text || "").replace(/\b[A-Z]{3,}\b/g, (word) => {
    if (ACRONYMS.has(word)) return word;
    return word.charAt(0) + word.slice(1).toLowerCase();
  });
}

export function dropPhrases(text, phrases = ALL_DROP_PHRASES) {
  let out = String(text || "");
  for (const phrase of phrases) {
    out = out.replace(new RegExp(escapeRegExp(phrase), "ig"), " ");
  }
  return out;
}

export function collapseNoise(text) {
  return String(text || "")
    .replace(/!+/g, ".")
    .replace(/\?{2,}/g, "?")
    .replace(/#{1,}\w+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?]){2,}/g, "$1")
    .trim();
}

export function splitSentences(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const protectedText = raw.replace(/\b([A-Za-z])\./g, "$1\u2024");
  return protectedText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\u2024/g, ".").trim())
    .filter(Boolean);
}

function hasFactSignal(sentence) {
  if (/\d/.test(sentence)) return true;
  const words = String(sentence || "").split(/\s+/);
  for (let i = 1; i < words.length; i += 1) {
    const token = words[i].replace(/[^A-Za-z]/g, "");
    if (token.length >= 3 && token[0] === token[0].toUpperCase() && token.slice(1) === token.slice(1).toLowerCase()) {
      return true;
    }
  }
  if (
    /\b(said|announced|reported|released|published|signed|filed|opened|closed|won|lost|rose|fell|according)\b/i.test(
      sentence,
    )
  ) {
    return true;
  }
  return false;
}

export function sentenceIsJunk(sentence) {
  const lower = sentence.toLowerCase();
  if (looksLikeAd(lower)) return true;
  if (ENGAGEMENT_PHRASES.some((p) => lower.includes(p))) {
    if (!/\d/.test(sentence) && !/\b(said|announced|reported)\b/i.test(sentence)) return true;
  }
  if (SENTIMENT_PADDING.some((p) => lower.includes(p)) && !hasFactSignal(sentence)) {
    return true;
  }
  if (looksLikeBait(lower) && !hasFactSignal(sentence)) return true;
  if (/\b(doctors|scientists|experts|they)\b.*\b(hate|love)\b/i.test(sentence) && sentence.length < 48) {
    return true;
  }
  if (sentence.replace(/[^A-Za-z0-9]/g, "").length < 8) return true;
  return false;
}

export function neutralizeText(text) {
  let out = stripEmojis(text);
  out = out.replace(/https?:\/\/\S+/g, " ");
  out = out.replace(/\b(utm_[a-z0-9]+|fbclid|gclid)=[^\s&]+/gi, " ");
  out = unshout(out);
  const kept = [];
  for (const sentence of splitSentences(out)) {
    if (sentenceIsJunk(sentence)) continue;
    const cleaned = collapseNoise(dropPhrases(sentence));
    if (!cleaned || sentenceIsJunk(cleaned)) continue;
    const ended = /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
    kept.push(ended);
  }
  return kept.join(" ").trim();
}

export function neutralizeHeadline(text) {
  const cleaned = neutralizeText(text);
  const first = splitSentences(cleaned)[0] || collapseNoise(dropPhrases(unshout(stripEmojis(text))));
  return first.replace(/[.]+$/, "").trim().slice(0, 140);
}

export function guardText(text) {
  return neutralizeText(text);
}

export function emptyBriefing(goal, extras = {}) {
  return {
    briefing_title: extras.briefing_title || "Briefing",
    as_of: extras.as_of || new Date().toISOString(),
    goal: goal || "",
    mode: extras.mode || "local",
    items: [],
    omitted: extras.omitted || "",
    sources_consulted: extras.sources_consulted || [],
    notes: extras.notes || [],
  };
}

function softenOwnCopy(text) {
  return collapseNoise(unshout(stripEmojis(text)));
}

export function guardBriefing(briefing) {
  const src = briefing && typeof briefing === "object" ? briefing : {};
  const items = Array.isArray(src.items) ? src.items : [];
  const guardedItems = items
    .map((item) => {
      const headline = neutralizeHeadline(item.headline || item.title || "");
      const summary = neutralizeText(item.summary || item.text || "");
      const relevance = neutralizeText(item.relevance || item.why_it_matters || "");
      const sources = Array.isArray(item.sources)
        ? item.sources
            .filter((s) => s && s.url && !looksLikeAd(`${s.title || ""} ${s.url}`))
            .map((s) => ({
              title: neutralizeHeadline(s.title || s.url).slice(0, 80) || "Source",
              url: String(s.url),
            }))
        : [];
      if (!summary) return null;
      return {
        headline: headline || neutralizeHeadline(summary) || "Note",
        summary,
        relevance,
        sources,
      };
    })
    .filter(Boolean)
    .slice(0, 8);

  return {
    briefing_title: neutralizeHeadline(src.briefing_title || "Briefing") || "Briefing",
    as_of: src.as_of || new Date().toISOString(),
    goal: src.goal || "",
    mode: src.mode || "local",
    items: guardedItems,
    omitted: softenOwnCopy(src.omitted || ""),
    sources_consulted: Array.isArray(src.sources_consulted) ? src.sources_consulted : [],
    notes: Array.isArray(src.notes) ? src.notes.map((n) => softenOwnCopy(n)).filter(Boolean) : [],
  };
}

const KIND_HINTS = {
  tech: [
    "software",
    "chip",
    "model",
    "app",
    "gpu",
    "security",
    "vulnerability",
    "apple",
    "google",
    "microsoft",
    "openai",
    "linux",
    "code",
    "computer",
    "electric",
    "solar",
    "mac",
    "iphone",
    "android",
    "semiconductor",
    "browser",
    "kernel",
  ],
  science: ["study", "paper", "trial", "climate", "space", "health", "sensor", "journal"],
  markets: ["market", "stock", "index", "inflation", "bank", "rate", "percent"],
};

export function briefingFromSources(goal, sources, extras = {}) {
  const dropped = { ads: 0, bait: 0, empty: 0 };
  const items = [];
  const kind = extras.kind || "";
  const hintGoal = [goal, ...(KIND_HINTS[kind] || [])].join(" ");

  for (const source of sources || []) {
    const blob = `${source.title || ""}. ${source.text || source.summary || ""}`;
    const adLike = looksLikeAd(blob);
    const baitLike = looksLikeBait(source.title || "") || looksLikeBait(source.text || "");
    const summaryRaw = neutralizeText(blob);
    const headline = neutralizeHeadline(source.title || "") || neutralizeHeadline(summaryRaw);
    const summary = dedupeSummary(headline, summaryRaw);
    if (!summary) {
      if (adLike) dropped.ads += 1;
      else dropped.empty += 1;
      continue;
    }
    if (adLike) dropped.ads += 1;
    if (baitLike) dropped.bait += 1;
    items.push({
      headline: headline || "Note",
      summary,
      relevance: relevanceLine(goal, summary || headline, hintGoal),
      sources: source.url
        ? [{ title: source.outlet || source.source || "Source", url: source.url }]
        : [],
      _score: relevanceScore(hintGoal, `${headline} ${summary}`),
    });
  }

  items.sort((a, b) => b._score - a._score);
  const scored = items.filter((item) => item._score > 0);
  const pool = scored.length ? scored : items;
  const top = pool.slice(0, 6).map(({ _score, ...rest }) => rest);
  const omittedParts = [];
  if (dropped.ads) omittedParts.push(`${dropped.ads} promotional or sponsored item${dropped.ads === 1 ? "" : "s"}`);
  if (dropped.bait) omittedParts.push(`${dropped.bait} item${dropped.bait === 1 ? "" : "s"} rewritten away from shock language`);
  if (items.length > top.length) {
    omittedParts.push(`${items.length - top.length} lower-relevance item${items.length - top.length === 1 ? "" : "s"}`);
  }

  return guardBriefing({
    briefing_title: titleForGoal(goal),
    as_of: extras.as_of || new Date().toISOString(),
    goal,
    mode: extras.mode || "local",
    items: top,
    omitted: omittedParts.length
      ? `Left out ${omittedParts.join("; ")}.`
      : "Nothing extra was cut beyond ordinary trimming.",
    sources_consulted: extras.sources_consulted || [],
    notes: extras.notes || [],
  });
}

function dedupeSummary(headline, summary) {
  const h = String(headline || "").replace(/[.]+$/, "").trim().toLowerCase();
  let s = String(summary || "").trim();
  if (!h || !s) return s;
  const lower = s.toLowerCase();
  if (lower.startsWith(h)) {
    s = s.slice(headline.replace(/[.]+$/, "").trim().length).replace(/^[\s.]+/, "");
  } else if (lower.startsWith(h + ".")) {
    s = s.slice(h.length + 1).replace(/^[\s.]+/, "");
  }
  return s || String(summary || "").trim();
}

export function titleForGoal(goal) {
  const g = String(goal || "").trim();
  if (!g) return "Briefing";
  const clipped = g.replace(/[.?!]+$/, "");
  return clipped.length > 72 ? `${clipped.slice(0, 69)}…` : clipped;
}

export function relevanceScore(goal, text) {
  const terms = tokenize(goal);
  if (!terms.length) return 0.2;
  const hay = tokenize(text);
  if (!hay.length) return 0;
  const hit = terms.filter((t) => hay.includes(t)).length;
  return hit / terms.length;
}

function relevanceLine(goal, text, scoredAgainst = goal) {
  const score = relevanceScore(scoredAgainst, text);
  if (score >= 0.35) return `Related to: ${titleForGoal(goal)}.`;
  if (score > 0) return "Partly related to the stated request.";
  return "";
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "your",
  "all",
  "any",
  "can",
  "her",
  "was",
  "one",
  "our",
  "out",
  "how",
  "what",
  "when",
  "who",
  "why",
  "from",
  "with",
  "this",
  "that",
  "have",
  "has",
  "had",
  "will",
  "just",
  "about",
  "want",
  "know",
  "recent",
  "doing",
  "they",
  "their",
]);
