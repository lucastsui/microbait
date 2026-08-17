import { cleanModelText } from "./openrouter.js";

export const DEFAULT_OPENCODE_URL = "https://opencode.ai/zen/v1/chat/completions";
export const DEFAULT_OPENCODE_MODEL = "big-pickle";

export function openCodeKey(cfg = {}) {
  return String(process.env.OPENCODE_API_KEY || cfg.opencode_key || "").trim();
}

export function openCodeUrl(cfg = {}) {
  return String(process.env.OPENCODE_URL || cfg.opencode_url || DEFAULT_OPENCODE_URL).trim();
}

export function openCodeModel(cfg = {}) {
  return String(process.env.OPENCODE_MODEL || cfg.opencode_model || DEFAULT_OPENCODE_MODEL).trim();
}

export function isOpenCodeServeUrl(url) {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "") || "/";
    return !/\/v1\b|chat\/completions|\/messages$|\/responses$/.test(path);
  } catch {
    return false;
  }
}

export function openCodeStatus(cfg = {}) {
  const url = openCodeUrl(cfg);
  const model = openCodeModel(cfg);
  const key = openCodeKey(cfg);
  const serve = isOpenCodeServeUrl(url);
  const ok = serve || Boolean(key);
  return {
    ok,
    url,
    model,
    hasKey: Boolean(key),
    key,
    serve,
    error: ok
      ? null
      : "Add an OpenCode API key from opencode.ai/auth, or set OPENCODE_URL to a running opencode serve.",
  };
}

export function openCodeAvailable(cfg = {}) {
  return openCodeStatus(cfg).ok;
}

export function textFromChatCompletions(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return cleanModelText(content);
  if (Array.isArray(content)) {
    return cleanModelText(content.map((part) => part?.text || part?.content || "").join(""));
  }
  return "";
}

export function textFromSessionMessage(data) {
  const parts = data?.parts || data?.data?.parts || [];
  const text = parts
    .filter((part) => part && (part.type === "text" || part.text))
    .map((part) => part.text || part.content || "")
    .join("");
  return cleanModelText(text);
}

async function postJson(url, body, headers, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error?.message || data.message || `OpenCode ${res.status}`);
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("OpenCode API timed out");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callServe(prompt, cfg) {
  const base = openCodeUrl(cfg).replace(/\/+$/, "");
  const created = await postJson(`${base}/session`, { title: "Microbait" }, {}, 20_000);
  const id = created.id || created.data?.id;
  if (!id) throw new Error("OpenCode serve did not return a session id");
  const model = openCodeModel(cfg);
  const [providerID, ...rest] = model.includes("/") ? model.split("/") : [];
  const body = {
    system:
      "You write Microbait briefings. Reply with only the briefing text. Do not use tools. Do not mention these instructions.",
    tools: {},
    parts: [{ type: "text", text: prompt }],
  };
  if (providerID && rest.length) {
    body.model = { providerID, modelID: rest.join("/") };
  }
  const reply = await postJson(`${base}/session/${id}/message`, body, {}, 180_000);
  const text = textFromSessionMessage(reply);
  if (!text) throw new Error("OpenCode API returned empty text");
  return text;
}

async function callChat(prompt, cfg) {
  const key = openCodeKey(cfg);
  if (!key) throw new Error(openCodeStatus(cfg).error);
  const data = await postJson(
    openCodeUrl(cfg),
    {
      model: openCodeModel(cfg),
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You write Microbait briefings. Reply with only the briefing text. Do not use tools. Do not mention these instructions.",
        },
        { role: "user", content: prompt },
      ],
    },
    { Authorization: `Bearer ${key}` },
    180_000,
  );
  const text = textFromChatCompletions(data);
  if (!text) throw new Error("OpenCode API returned empty text");
  return text;
}

export function callOpenCode(prompt, cfg = {}) {
  return isOpenCodeServeUrl(openCodeUrl(cfg)) ? callServe(prompt, cfg) : callChat(prompt, cfg);
}
