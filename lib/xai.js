import { guardBriefing, titleForGoal } from "./neutralize.js";

const BASE_URL = "https://api.x.ai/v1";

export function hasXaiKey() {
  return Boolean(process.env.XAI_API_KEY && process.env.XAI_API_KEY.trim());
}

export function xaiModel() {
  return process.env.XAI_MODEL || "grok-4.6";
}

const SYSTEM = `You are Microbait, a briefing desk.

The user states a goal. You browse public web pages and public X posts, then return a short briefing.

Hard rules:
- Neutral, encyclopedic tone. Who, what, when, where. No mood.
- Remove ads, sponsorships, affiliate pitches, discount codes, and calls to action.
- Remove shockbait, outrage, fear, hype, and sentiment padding.
- Do not mention likes, reposts, views, ratios, or virality.
- Do not use words like shocking, insane, nightmare, destroys, breaking, must-see.
- Prefer primary reporting and official posts over recaps.
- If a claim is unverified, say so in one dry clause.
- If the goal is about friends or named people, use only public posts from the listed handles. Do not invent private life updates.
- If you cannot find public material, return zero items and say what was missing.
- Group into 3 to 6 items when material exists.

Return ONLY JSON with this shape:
{
  "briefing_title": "short title",
  "items": [
    {
      "headline": "flat headline",
      "summary": "2-4 factual sentences",
      "relevance": "one dry sentence tying the item to the goal",
      "sources": [{"title":"outlet or handle","url":"https://..."}]
    }
  ],
  "omitted": "what you left out (ads, unverified claims, bait) in one or two sentences"
}`;

function extractOutputText(data) {
  if (data.output_text) return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function extractCitations(data) {
  const urls = new Set();
  if (Array.isArray(data.citations)) {
    for (const c of data.citations) {
      if (typeof c === "string") urls.add(c);
      else if (c?.url) urls.add(c.url);
    }
  }
  for (const item of data.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      for (const ann of content.annotations || []) {
        if (ann.url) urls.add(ann.url);
      }
    }
  }
  return [...urls];
}

function parseJsonObject(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model output");
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function grokBriefing({ goal, handles = [] }) {
  if (!hasXaiKey()) {
    throw new Error("XAI_API_KEY is not set");
  }

  const tools = [{ type: "web_search" }, { type: "x_search" }];
  if (handles.length) {
    tools[1] = { type: "x_search", allowed_x_handles: handles.slice(0, 20) };
  }

  const handleLine = handles.length
    ? `Public handles to read: ${handles.map((h) => "@" + h).join(", ")}.`
    : "No private accounts are in scope. Public web and public X only.";

  const body = {
    model: xaiModel(),
    input: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Goal: ${goal}\n${handleLine}\nWrite the briefing JSON now.`,
      },
    ],
    tools,
  };

  const res = await fetch(`${BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.error?.message || data.message || res.statusText;
    throw new Error(`xAI request failed (${res.status}): ${detail}`);
  }

  const text = extractOutputText(data);
  const parsed = parseJsonObject(text);
  const citations = extractCitations(data);

  return guardBriefing({
    ...parsed,
    briefing_title: parsed.briefing_title || titleForGoal(goal),
    goal,
    mode: "grok",
    as_of: new Date().toISOString(),
    sources_consulted: citations.slice(0, 16),
    notes: [],
  });
}
