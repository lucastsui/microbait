import assert from "node:assert/strict";
import test from "node:test";
import { currentProvider, normalizeProvider, providerAvailable } from "../lib/brief-ai.js";
import {
  isOpenCodeServeUrl,
  openCodeAvailable,
  openCodeStatus,
  textFromChatCompletions,
  textFromSessionMessage,
} from "../lib/opencode.js";

test("provider ids collapse to grok or opencode", () => {
  assert.equal(normalizeProvider("OpenCode"), "opencode");
  assert.equal(normalizeProvider("grok"), "grok");
  assert.equal(normalizeProvider("nope"), "grok");
  assert.equal(currentProvider({ ai: "opencode" }), "opencode");
});

test("OpenCode is ready when a key or a serve URL is set", () => {
  assert.equal(openCodeAvailable({}), false);
  assert.equal(openCodeAvailable({ opencode_key: "sk-test" }), true);
  assert.equal(openCodeAvailable({ opencode_url: "http://127.0.0.1:4096" }), true);
  assert.equal(providerAvailable({ ai: "opencode" }), false);
  assert.equal(providerAvailable({ ai: "opencode", opencode_key: "sk-test" }), true);
  assert.match(openCodeStatus({}).error, /OpenCode API key/i);
});

test("serve URLs are the local opencode HTTP API, not Zen chat completions", () => {
  assert.equal(isOpenCodeServeUrl("http://127.0.0.1:4096"), true);
  assert.equal(isOpenCodeServeUrl("https://opencode.ai/zen/v1/chat/completions"), false);
});

test("reads briefing text from OpenCode chat and session payloads", () => {
  assert.equal(
    textFromChatCompletions({ choices: [{ message: { content: "[@ada]: The chip is out." } }] }),
    "[@ada]: The chip is out.",
  );
  assert.equal(
    textFromSessionMessage({ parts: [{ type: "text", text: "[@ada]: The chip is out." }] }),
    "[@ada]: The chip is out.",
  );
});
