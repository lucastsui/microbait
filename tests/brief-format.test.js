import assert from "node:assert/strict";
import test from "node:test";
import { authorHref, briefHtml, joinBrief, postLinks, splitBrief } from "../lib/brief-format.js";
import { unwrapJobUrl } from "../lib/job-search.js";

test("author handle links to the status URL, not the profile", () => {
  const posts = [
    { handle: "ada", url: "https://x.com/ada/status/111" },
    { handle: "bev", url: "https://x.com/bev/status/222" },
  ];
  const html = briefHtml(
    "Event:\n[@ada]: The chip is out.\nSkill automated\nHand-write ranking code yourself\nNew Demand\nDirect an AI coding assistant that writes ranking systems\n\nEvent:\n[@bev]: A note.\nSkill automated\nHand-draw wiring diagrams\nNew Demand\nDirect an AI coding assistant to generate wiring docs",
    posts,
  );
  assert.match(html, /href="https:\/\/x\.com\/ada\/status\/111"/);
  assert.match(html, /href="https:\/\/x\.com\/bev\/status\/222"/);
  assert.doesNotMatch(html, /href="https:\/\/x\.com\/ada"/);
  assert.match(html, />@ada</);
});

test("two posts from the same handle keep their own URLs in order", () => {
  const posts = [
    { handle: "ada", url: "https://x.com/ada/status/1" },
    { handle: "ada", url: "https://x.com/ada/status/2" },
  ];
  const html = briefHtml("[@ada]: First.\n\n[@ada]: Second.", posts);
  assert.match(html, /status\/1/);
  assert.match(html, /status\/2/);
});

test("postLinks drops empty handles and falls back without a status id", () => {
  const links = postLinks([
    { handle: "ada", url: "https://x.com/home" },
    { handle: "", url: "https://x.com/x/status/9" },
  ]);
  assert.equal(links[0].url, "https://x.com/ada");
  assert.equal(links.length, 1);
  const used = new Set();
  assert.equal(authorHref("ghost", links, used), "https://x.com/ghost");
});

test("hides job lists until ads are loaded", () => {
  const html = briefHtml(
    "Event:\n[@ada]: The chip is out.\nSkill automated\nHand-write ranking code yourself\nNew Demand\nTrain ranking models",
    [{ handle: "ada", url: "https://x.com/ada/status/1" }],
    null,
  );
  assert.doesNotMatch(html, /job-list|job-empty/);
});

test("lists job ads under each more-valuable skill", () => {
  const html = briefHtml(
    "Event:\n[@ada]: The chip is out.\nSkill automated\nHand-write ranking code yourself\nNew Demand\nTrain ranking models",
    [{ handle: "ada", url: "https://x.com/ada/status/1" }],
    [{ skill: "Train ranking models", ads: [{ title: "Ranking Engineer", url: "https://www.linkedin.com/jobs/view/99", snippet: "Acme" }] }],
  );
  assert.match(html, /card-event/);
  assert.match(html, /Skill automated/);
  assert.match(html, /New Demand/);
  assert.match(html, /class="job-link"/);
  const spaced = briefHtml(
    "Event:\n\n[@ada]: The chip is out.\n\nSkill automated\n\nHand-write ranking code yourself\n\nNew Demand\n\nTrain ranking models",
    [{ handle: "ada", url: "https://x.com/ada/status/1" }],
    null,
  );
  assert.doesNotMatch(spaced, /Event:<\/span>\s*\n\s*\n/);
  assert.match(spaced, /card-event/);
  assert.match(spaced, /card-summary/);
  assert.match(html, /href="https:\/\/www\.linkedin\.com\/jobs\/view\/99"/);
  assert.match(html, /Ranking Engineer/);
  assert.match(html, /Acme/);
});

test("splitBrief keeps one card per [@handle] block and can drop a lead", () => {
  const raw =
    "Labs cheapened proof work and outbound email.\n\nEvent:\n[@ada]: The chip is out.\nSkill automated\nHand-write ranking code yourself\nNew Demand\nTrain ranking models\n\nEvent:\n[@bev]: A robot learns from one demo.\nSkill automated\nCollect huge robot datasets\nNew Demand\nSpecify safe robot tasks";
  const { items } = splitBrief(raw);
  assert.equal(items.length, 2);
  assert.equal(items[0].handle, "ada");
  assert.match(items[0].text, /^Event:/);
  assert.match(items[0].text, /New Demand\nTrain ranking models/);
  assert.equal(items[1].handle, "bev");
  assert.equal(
    joinBrief("", items),
    "Event:\n[@ada]: The chip is out.\nSkill automated\nHand-write ranking code yourself\nNew Demand\nTrain ranking models\n\nEvent:\n[@bev]: A robot learns from one demo.\nSkill automated\nCollect huge robot datasets\nNew Demand\nSpecify safe robot tasks",
  );
});

test("splitBrief with no cards keeps the whole text as lead", () => {
  const { lead, items } = splitBrief("No posts survived.");
  assert.equal(lead, "No posts survived.");
  assert.equal(items.length, 0);
});

test("unwraps DuckDuckGo job redirects", () => {
  assert.equal(
    unwrapJobUrl("https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.linkedin.com%2Fjobs%2Fview%2F123"),
    "https://www.linkedin.com/jobs/view/123",
  );
});
