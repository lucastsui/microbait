import { DEFAULT_MODEL, FALLBACK_MODELS } from "./config.js";

const SPECIAL_TOKEN_RE =
  /<\/?(?:pad|unk|s|bos|eos|eot)\s*\/?>|<\|(?:endoftext|im_end|im_start|end|start)\|>/gi;

export function cleanModelText(text) {
  let out = String(text || "");
  const padAt = out.search(/<pad>/i);
  if (padAt >= 0) out = out.slice(0, padAt);
  out = out.replace(SPECIAL_TOKEN_RE, "");
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function pingOpenRouter(key, model = DEFAULT_MODEL) {
  const text = await callOpenRouter(key, model, "Reply with the single word ok.", 8);
  return Boolean(text);
}

async function completeOnce(key, model, prompt, maxTokens) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://microbait.local",
      "X-Title": "Microbait",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || `OpenRouter ${res.status}`);
  }
  const text = cleanModelText(data.choices?.[0]?.message?.content || "");
  if (!text) {
    throw new Error(`OpenRouter returned empty text from ${model}`);
  }
  return text;
}

export async function callOpenRouter(key, model, prompt, maxTokens = 1200) {
  const tried = [];
  const queue = [model || DEFAULT_MODEL, ...FALLBACK_MODELS];
  let lastErr = new Error("OpenRouter returned empty text");
  for (const slug of queue) {
    if (!slug || tried.includes(slug)) continue;
    tried.push(slug);
    try {
      return await completeOnce(key, slug, prompt, maxTokens);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export function deltaFromSseData(raw) {
  const line = String(raw || "").trim();
  if (!line || line === "[DONE]") return { done: true, text: "" };
  let data;
  try {
    data = JSON.parse(line);
  } catch {
    return { done: false, text: "" };
  }
  if (data.error) {
    throw new Error(data.error.message || "Provider returned error");
  }
  return { done: false, text: data.choices?.[0]?.delta?.content || "" };
}

async function streamOnce(key, model, prompt, maxTokens, onDelta) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://microbait.local",
      "X-Title": "Microbait",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.2,
      stream: true,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `OpenRouter ${res.status}`);
  }
  if (!res.body) throw new Error(`OpenRouter returned empty text from ${model}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      const chunk = deltaFromSseData(payload);
      if (chunk.done) {
        out = cleanModelText(out);
        if (!out) throw new Error(`OpenRouter returned empty text from ${model}`);
        return out;
      }
      if (chunk.text) {
        if (/<pad>/i.test(chunk.text) || /<pad>/i.test(out + chunk.text)) {
          out = cleanModelText(out + chunk.text);
          if (!out) throw new Error(`OpenRouter returned empty text from ${model}`);
          return out;
        }
        out += chunk.text;
        onDelta?.(chunk.text);
      }
    }
  }
  out = cleanModelText(out);
  if (!out) throw new Error(`OpenRouter returned empty text from ${model}`);
  return out;
}

export async function callOpenRouterStream(key, model, prompt, onDelta, maxTokens = 1600) {
  const tried = [];
  const queue = [model || DEFAULT_MODEL, ...FALLBACK_MODELS];
  let lastErr = new Error("OpenRouter returned empty text");
  for (const slug of queue) {
    if (!slug || tried.includes(slug)) continue;
    tried.push(slug);
    try {
      return await streamOnce(key, slug, prompt, maxTokens, onDelta);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

