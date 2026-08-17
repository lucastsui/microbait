import assert from "node:assert/strict";
import test from "node:test";
import { extractUpSkills, keepBrief, refineHireablePrompt, summarizePrompt, trimBriefPreamble } from "../lib/brief-prompt.js";
import { callOpenRouter, cleanModelText, deltaFromSseData } from "../lib/openrouter.js";

test("empty OpenRouter content is a failure and tries a fallback", async () => {
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, opts) => {
    calls += 1;
    const body = JSON.parse(opts.body);
    assert.ok(body.model);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "   " } }] }),
    };
  };
  try {
    await assert.rejects(() => callOpenRouter("sk-test", "dead-model", "ping", 8), /empty text/);
    assert.ok(calls >= 2);
  } finally {
    globalThis.fetch = orig;
  }
});

test("strips pad tokens and cuts off a pad loop", () => {
  assert.equal(cleanModelText("Hello <pad><pad><pad>"), "Hello");
  assert.equal(cleanModelText("<pad><pad>"), "");
  assert.match(cleanModelText("A change.\n<pad><pad>"), /A change/);
});

test("OpenRouter SSE deltas yield tokens and done", () => {
  assert.deepEqual(deltaFromSseData("[DONE]"), { done: true, text: "" });
  assert.equal(deltaFromSseData('{"choices":[{"delta":{"content":"Claude"}}]}').text, "Claude");
  assert.equal(deltaFromSseData('{"choices":[{"delta":{}}]}').text, "");
  assert.throws(() => deltaFromSseData('{"error":{"message":"Provider returned error"}}'), /Provider returned error/);
});

test("summarize prompt asks for Event, handle, automated skill, and New Demand", () => {
  const prompt = summarizePrompt(
    [{ author: "Ada", handle: "Ada", text: "The chip is out." }],
    "understand tech trends",
  );
  assert.match(prompt, /Event:/);
  assert.match(prompt, /\[@handle\]:/);
  assert.match(prompt, /Skill automated/);
  assert.match(prompt, /New Demand/);
  assert.match(prompt, /first line must be "Event:"/);
  assert.doesNotMatch(prompt, /Author:/);
  assert.doesNotMatch(prompt, /Summary:/);
  assert.doesNotMatch(prompt, /Impact:/);
  assert.match(prompt, /skill at risk/);
  assert.match(prompt, /companies already list/);
  assert.match(prompt, /verb-first/);
  assert.match(prompt, /without the summary/);
  assert.match(prompt, /Do not point back/);
  assert.match(prompt, /not automatically "Direct the new tool/);
  assert.match(prompt, /hireable skill/);
  assert.match(prompt, /same grain/);
  assert.match(prompt, /Do not collapse/);
  assert.match(prompt, /If you cannot name a hireable skill at the same grain/);
  assert.match(prompt, /Train ranking and recommendation models/);
  assert.match(prompt, /@Ada/);
  assert.match(prompt, /The chip is out/);
});

test("extracts New Demand skills and asks a rewrite from job ads", () => {
  const draft =
    "Event:\n[@ada]: The chip is out.\nSkill automated\nHand-write ranking code yourself\nNew Demand\nDecide whether a new residual design should replace ResNets";
  assert.deepEqual(extractUpSkills(draft), ["Decide whether a new residual design should replace ResNets"]);
  const refine = refineHireablePrompt(draft, "SKILL: residual\n- (no job ads found)");
  assert.match(refine, /JOB ADS:/);
  assert.match(refine, /New Demand/);
  assert.match(refine, /same grain/);
  assert.match(refine, /no job ads found/);
});

test("drops any text before the first Event or [@handle] line", () => {
  const raw =
    "I'll read the truncated posts.\n\nEvent:\n[@ada]: The chip is out.\nSkill automated\nWriting the chip by hand\nNew Demand\nDirecting the tool";
  assert.equal(
    trimBriefPreamble(raw),
    "Event:\n[@ada]: The chip is out.\nSkill automated\nWriting the chip by hand\nNew Demand\nDirecting the tool",
  );
  assert.equal(trimBriefPreamble("[@ada]: already clean"), "[@ada]: already clean");
  assert.equal(
    trimBriefPreamble("Labs are shipping one-shot robot learning.\n\n[@ada]: The chip is out."),
    "[@ada]: The chip is out.",
  );
});

test("keeps the draft when the rewrite is not a briefing", () => {
  const draft =
    "Event:\n[@ada]: The chip is out.\nSkill automated\nHand-write ranking code yourself\nNew Demand\nTrain ranking models";
  assert.equal(keepBrief("I need the actual job-ad wording.", draft), draft);
  assert.match(keepBrief("Preamble.\n\nEvent:\n[@ada]: ok\nSkill automated\na\nNew Demand\nb", draft), /^Event:/);
});

