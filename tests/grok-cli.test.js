import assert from "node:assert/strict";
import test from "node:test";
import { grokArgs, grokAvailable } from "../lib/grok-cli.js";

test("Grok CLI args disable tools and keep a short briefing", () => {
  const prev = {
    GROK_MODEL: process.env.GROK_MODEL,
    GROK_REASONING: process.env.GROK_REASONING,
    GROK_EXTRA_ARGS: process.env.GROK_EXTRA_ARGS,
  };
  process.env.GROK_MODEL = "grok-4.6";
  process.env.GROK_REASONING = "low";
  delete process.env.GROK_EXTRA_ARGS;
  try {
    const args = grokArgs({ promptFile: "/tmp/microbait-prompt.txt", stream: false });
    assert.ok(args.includes("--system-prompt-override"));
    assert.ok(args.includes("--disallowed-tools"));
    assert.ok(args.includes("Agent"));
    assert.ok(args.includes("--no-subagents"));
    assert.ok(args.includes("--no-memory"));
    assert.ok(args.includes("--reasoning-effort"));
    assert.ok(args.includes("low"));
    assert.ok(args.includes("-m"));
    assert.ok(args.includes("grok-4.6"));
    assert.ok(!args.includes("--tools"));
    assert.equal(args[args.indexOf("--output-format") + 1], "plain");
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("a missing GROK_BIN path is not available", () => {
  const prev = process.env.GROK_BIN;
  process.env.GROK_BIN = "/nonexistent/grok";
  try {
    assert.equal(grokAvailable(), false);
  } finally {
    if (prev === undefined) delete process.env.GROK_BIN;
    else process.env.GROK_BIN = prev;
  }
});
