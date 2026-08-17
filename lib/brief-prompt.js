export function formatPosts(posts) {
  return posts
    .map((post, i) => {
      const handle = String(post.handle || "")
        .trim()
        .replace(/^@/, "");
      const author = post.author || handle || "Unknown";
      const url = post.url || (handle ? `https://x.com/${handle}` : "");
      const at = handle ? `@${handle}` : "";
      return `--- POST ${i + 1} ---\nhandle: ${at || "(none)"}\nname: ${author}\nurl: ${url}\n${(post.text || "").trim()}\n`;
    })
    .join("\n");
}

export function summarizePrompt(posts, focus) {
  const extra = focus
    ? `\nThe user said they want to know: ${focus}\nTreat a vague goal like "tech trends" as: what work is already being done that just got cheaper, then a hireable skill of the same size that companies already list as a job responsibility.\n`
    : `\nThe user did not name a narrower goal. Default to: what work is already being done that just got cheaper, then a hireable skill of the same size that companies already list as a job responsibility.\n`;
  return `You are Microbait. These posts were taken from the user's X home timeline.

The post body under each POST header is the full text you get. Work only from that. Do not say you will read more. Do not mention truncation.

Skip ads, sponsored posts, product pitches, affiliate codes, and app-install prompts.
Keep real posts from people and pages they follow.
Drop a post if it is only status, banter, or a lab marketing flex with no change in what a person can do.

Your entire reply is the report. The first line must be "Event:". No preamble. No overview paragraph.

For each kept post write this exact block, then one blank line before the next Event. Do not put blank lines inside a card. Copy this shape, swapping in the real handle and wording:

Event:
[@ada]: The lab released a chip that writes the ranking code a person used to write by hand.
Skill automated
Hand-write ranking and recommendation code yourself
New Demand
Train ranking and recommendation models and reject rankings that fail a real user job

Rules for every item:
- The token inside the brackets is only the author's @handle from that post. Never a display name. Never the words Author, Summary, or Impact.
- Line 1 is exactly Event:
- Line 2 begins with [@handle]: then the summary on that same line.
- Line 3 is exactly Skill automated
- Line 4 is the skill at risk: work people already do that this post makes cheaper.
- Line 5 is exactly New Demand
- Line 6 is the newly needed hireable skill companies already list in that field.
- Skill automated and New Demand must be the same grain. If the automated skill names a concrete workflow, New Demand is the matching responsibility, not a whole occupation.
- Do not collapse New Demand to a job title such as "Model 3D characters for games", "Be a computer vision engineer", or "Design conversational voice agents".
- Write New Demand as a job-ad bullet: a hireable responsibility you could find in a posting, still specific enough to sit next to the automated skill.
- Do not write a one-off judgment that exists only for this post. Do not name a paper, a skip path, a residual design, or "decide whether this new method should replace X".
- Each skill line is a full verb-first sentence. A person reading only that line later, without the summary, must still know what the skill is.
- Name the kind of work, not the one artifact from the post. Do not write "the scene", "the Three.js animation", "that ranking code", or "the model".
- Do not point back at the summary with this, that, those, or it. Repeat the kind of work in the skill line itself.
- If an AI coding assistant is involved, say "AI coding assistant". Never leave "model" ambiguous (3D model, theory, or AI).
- The New Demand line is not automatically "Direct the new tool, then judge its output."
- If you cannot name a hireable skill at the same grain as Skill automated, drop the post.
- Scope the skills to the work in the post. Do not say all thinking or all expertise got cheaper.

No extra headings. No arrows. No bullets. No like counts. No shock language. Do not invent a career collapse from one example.
${extra}
POSTS:
${formatPosts(posts)}
`;
}

export function trimBriefPreamble(text) {
  const raw = String(text || "");
  const event = raw.search(/^Event:\s*$/m);
  const handle = raw.search(/^\[@/m);
  if (event === -1 && handle === -1) return raw;
  if (event === -1) return raw.slice(handle);
  if (handle === -1) return raw.slice(event);
  return raw.slice(Math.min(event, handle));
}

export function keepBrief(grounded, draft) {
  const g = trimBriefPreamble(grounded);
  return /\[@[A-Za-z0-9_]{1,32}\]/.test(g) ? g : trimBriefPreamble(draft);
}

function skillAfterLabel(lines, label) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!label.test(lines[i])) continue;
    const next = (lines[i + 1] || "").replace(/^[⬇️⬆️]\s*/, "").trim();
    if (!next || /^(Event:|Skill automated|New Demand)$/i.test(next) || /^\[@/.test(next)) continue;
    out.push(next);
  }
  return out;
}

export function extractUpSkills(text) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim());
  const fromDemand = skillAfterLabel(lines, /^New Demand$/i);
  if (fromDemand.length) return fromDemand;
  return lines
    .filter((line) => line.startsWith("⬆️"))
    .map((line) => line.replace(/^⬆️\s*/, "").trim())
    .filter(Boolean);
}

export function refineHireablePrompt(draft, jobBlocks) {
  return `You are Microbait. Rewrite only the New Demand skill lines in this draft.

Work only from the draft and the JOB ADS block below. Do not say you will search. Do not mention listings.
Keep every Event: line, every [@handle]: line, every Skill automated heading, and every automated-skill line exactly as written.
Rewrite each New Demand skill as a hireable job-ad responsibility at the same grain as its Skill automated line, using the job-ad snippets when they exist.
If Skill automated is a concrete workflow, New Demand must stay a concrete responsibility, not a whole job title or occupation.
Do not collapse New Demand to "Model 3D characters for games" or any other ultra-generic role.
Do not keep a paper-specific judgment. Do not invent an employer.
If the snippets are empty, keep the same grain and name the nearest hireable responsibility, not a broader job title.
Your entire reply is the report. The first line must be "Event:". No preamble.

DRAFT:
${draft}

JOB ADS:
${jobBlocks || "(none)"}
`;
}
