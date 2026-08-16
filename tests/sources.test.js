import assert from "node:assert/strict";
import test from "node:test";
import { parseRss, queryTerms } from "../lib/sources.js";

const SAMPLE = `
<rss><channel>
<item>
  <title>County reports 12 new clinics</title>
  <link>https://example.test/clinics</link>
  <description>The health board opened 12 clinics on Monday.</description>
</item>
<item>
  <title>Shop now: miracle tonic</title>
  <link>https://example.test/ad</link>
  <description>Limited time offer. Use code NOW.</description>
</item>
</channel></rss>
`;

test("RSS parser keeps news and drops ads", () => {
  const items = parseRss(SAMPLE, "Desk");
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "County reports 12 new clinics");
  assert.equal(items[0].outlet, "Desk");
});

test("query terms drop short words", () => {
  assert.equal(queryTerms("I want to know recent tech development"), "");
  assert.equal(queryTerms("OpenAI model release notes"), "openai model release notes");
});
