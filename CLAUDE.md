# Microbait

improvable: true

## Goal
Standalone desktop app that briefs the user's X home timeline from Electron's Chromium plus Grok CLI or the OpenCode API.

## Metric
- Eval: `./eval.sh` — last line prints METRIC=<float>, higher is better
- Baseline: 1.0000 (2026-08-15)
- Best: 1.0000 (2026-08-15)

The number is the mean neutralization score on a frozen bait corpus (`fixtures/bait-corpus.json`). Each item scores a blend of fact retention, bait/ad removal, and briefing structure. Empty output scores zero.

## Ratchet
Keep a change only if the eval passes and METRIC does not regress from Best.
If it regresses, revert before doing anything else.

## Loop
One cycle = read this file → pick ONE improvement (never one that a Lesson already
marked failed) → implement → run eval → keep-or-revert → append one Lessons line →
update State → commit if kept.
Stop condition: three consecutive cycles without improvement → write PLATEAU in
State, stop looping, tell James.

## State
Desktop (`npm start`). Connect X always opens Chrome to the X login flow, then copies cookies into Electron. Setup also connects LinkedIn in the right-hand panel (same session as job previews). The header shows X and LinkedIn connected or not connected, not handles. Setup picks Grok CLI or the OpenCode API. No overview paragraph. Each card is Event, then `[@handle]: summary`, Skill automated, New Demand, then that card’s job links, one card at a time. Clicking an X post or job ad slides a preview in from the right. After LinkedIn login, keep returning to that job until it stays open. Eval remains 1.0000.

## Lessons
- 2026-08-15: Started from a product idea, not a metric. Chose a frozen bait corpus so "calmer voice" can be scored without a live social login.
- 2026-08-15: Searching HN with the raw goal sentence matched career threads. Generic tech goals should use the front page; keep only specific leftover terms for search.
- 2026-08-15: Sentence splitting on every period cut "U.S. Ambassador" in half. Protect single-letter initials before splitting.
- 2026-08-16: Friend feeds need the user's own OAuth, not a public scrape. Facebook still will not give a full friend graph without Meta review.
- 2026-08-16: /facebook works because it reuses the Chrome login, not Graph API. Microbait Link Facebook should use that same reader if the user wants a home-feed summary.
- 2026-08-16: A deployable web app can do this for X with user OAuth. Facebook newsfeed OAuth is not available. Product is X-only.
- 2026-08-16: Hosted OAuth means the operator holds a token. Standalone + Chrome login keeps the session on the user's machine.
- 2026-08-16: Product is a terminal command, not a desktop window. Onboard once (X via Chrome, OpenRouter key), then brief like /facebook.
- 2026-08-16: User asked to remake the app. Desktop window is back; it shares ~/.microbait/config.json with the CLI.
- 2026-08-16: `.page { display: flex }` beat the HTML hidden attribute, so the desk sat under setup. Hide with `.page[hidden] { display: none }`.
- 2026-08-16: User asked to delete the terminal app. Product is the desktop window only.
- 2026-08-16: Disconnect must clear x_username and return to setup. Connect alone is not enough once an account is stored.
- 2026-08-16: Missing handle defaulted to the site name X, so a logged-out splash still said Connected as @X. Require a real screen name; open a visible x.com window when Chrome has no auth cookies.
- 2026-08-16: Playwright plus the Facebook venv is not shippable. X login and feed reading belong in Electron's own Chromium with a persist partition.
- 2026-08-16: ESM preload plus sandbox left window.microbait undefined, so Connect X never opened a window. Drive X from the main-process HTTP server; use a CommonJS preload if IPC is needed.
- 2026-08-16: Google passkeys live in Chrome, not in Electron. An in-app Chromium window cannot complete "use your passkey". Open real Chrome, then import X cookies.
- 2026-08-16: Chrome cookie DB v24 prepends sha256(domain) to decrypted values. Without stripping 32 bytes, auth_token is garbage and Connect X never finishes.
- 2026-08-16: API edge tests must not write ~/.microbait/config.json. Honor MICROBAIT_HOME in loadConfig/saveConfig.
- 2026-08-16: meta-llama/llama-3.3-70b-instruct:free is gone. Default to a :free slug that still pings, currently google/gemma-4-26b-a4b-it:free.
- 2026-08-16: gemma-4-26b-a4b-it:free 429s under load. Prefer openrouter/free and fall back to it when the configured slug fails.
- 2026-08-16: A Playwright tab on :3847 is not the Electron window. Open CDP on 127.0.0.1:9222 and attach with `npm run test:e2e`.
- 2026-08-16: A "tech trends" goal is a stake (stay useful), not a topic list. Each kept post should say the change, what work got cheaper, and what work is now the scarce part. Do not inflate one example into all expertise dying.
- 2026-08-16: Long briefs feel stuck on "Reading…". Stream real feed notes, then OpenRouter tokens, over SSE. Keep JSON errors for the non-stream path.
- 2026-08-16: Free models sometimes stream thousands of visible <pad> tokens. Treat <pad> as end of text, strip special tokens, and do not paint them.
- 2026-08-16: User asked for Grok CLI as the briefing model. Do not require an OpenRouter key. Each item is Author, Summary, Impact (what lost value / what gained it).
- 2026-08-16: Briefing items are [@handle]: summary, then ⬇️ / ⬆️ skill lines. No Author/Summary/Impact labels. The handle is the link.
- 2026-08-16: Arrow lines must stand alone later. Verb-first. Name the kind of work, not "the scene" or an ambiguous "model".
- 2026-08-16: The [@handle] link must open the post (`/status/id`), not the author's profile.
- 2026-08-16: Do not prompt ⬆️ as "direct the new tool." Ask what still has to be authored, chosen, allowed, or true after the cheap work.
- 2026-08-16: ⬆️ must be a job-searchable hireable skill, then rewritten from live job-ad snippets. Paper-specific judgments do not match postings.
- 2026-08-16: Show the matching job ads under each ⬆️. LinkedIn guest search first, DuckDuckGo fallback.
- 2026-08-16: ⬇️ and ⬆️ must be the same grain. Do not pair a concrete workflow with a whole job title.
- 2026-08-17: The briefing existed but never showed as a summary. `~/.grok/config.toml` defaults to `grok-4.6` + `xhigh`, `--tools ""` left every tool on, and trimBriefPreamble deleted any lead paragraph. Two agent runs finished before the first token. Override the system prompt, reason at `low`, stream the draft, keep a 2–3 sentence answer. METRIC 1.0000 → 1.0000.
- 2026-08-17: Dumping every summary first, then searching all jobs, looked finished while still working. Reveal one card: summary + skills, then that card’s job ads, then the next card. METRIC 1.0000 → 1.0000.
- 2026-08-17: A 2–3 sentence overview sat above the cards and belonged to none of them. Cards only: summary, skills, jobs. Drop any preamble before the first [@handle]. METRIC 1.0000 → 1.0000.
- 2026-08-17: Local secrets live in gitignored `.env` and `~/.microbait/config.json`. A real X handle was in a tracked test; replace it with a fixture handle. METRIC 1.0000 → 1.0000.
- 2026-08-17: X and LinkedIn refuse iframes. Slide a right-hand drawer, then load the page in an Electron BrowserView on the signed-in X partition or a preview partition. METRIC 1.0000 → 1.0000.
- 2026-08-17: A leftover BrowserView stayed on the welcome screen and hid later cards. Destroy the preview on close/home/Ask; keep every card filling in on the left. METRIC 1.0000 → 1.0000.
- 2026-08-17: User asked to choose Grok or OpenCode API. Store `ai` plus the OpenCode key in ~/.microbait/config.json. Default OpenCode to Zen `/v1/chat/completions`; a serve-style URL uses `/session`. METRIC 1.0000 → 1.0000.
- 2026-08-17: LinkedIn login in the drawer dumps to feed or onboarding. Keep the job URL, ignore login/checkpoint pages, then load the job once after auth. METRIC 1.0000 → 1.0000.
- 2026-08-17: Prepend the Grok-style concentric spinner to AI think lines and job-wait copy so a run does not look idle. METRIC 1.0000 → 1.0000.
- 2026-08-17: User asked to drop Grok. OpenCode is the only briefing backend. Prompt helpers live in brief-prompt.js; grok-cli.js is gone. METRIC 1.0000 → 1.0000.
- 2026-08-17: User asked to add Grok CLI back. Setup picks Grok CLI or OpenCode again; `ai` stays in ~/.microbait/config.json. METRIC 1.0000 → 1.0000.
- 2026-08-17: The header should say X connected or X not connected, never the @handle. METRIC 1.0000 → 1.0000.
- 2026-08-17: Connect X skipped Chrome when leftover twid looked like a session, and opened /home instead of login. Always open Chrome to /i/flow/login first; treat only auth_token as signed in. METRIC 1.0000 → 1.0000.
- 2026-08-17: LinkedIn login still dumped to feed because bounce was one-shot and ignored regional hosts. Keep retrying until the job URL holds; treat li_at as signed in. METRIC 1.0000 → 1.0000.
- 2026-08-17: Sign in to LinkedIn on Setup, not only from a job click. Header shows LinkedIn connected like X. Same persist preview partition. METRIC 1.0000 → 1.0000.
- 2026-08-17: Connect LinkedIn opened a 0×0 BrowserView (bounds were set before the view existed) and used Electron’s default UA, so the panel looked blank. Remember drawer bounds and send a Chrome UA. METRIC 1.0000 → 1.0000.
- 2026-08-17: Report cards are Event, [@handle] summary, Skill automated, New Demand, then jobs. Drop arrow-only labels. METRIC 1.0000 → 1.0000.
- 2026-08-17: Blank lines after Event/Skill automated/New Demand plus pre-wrap made cards look double-spaced. Drop empty lines when rendering. METRIC 1.0000 → 1.0000.
- 2026-08-17: Block labels plus pre-wrap newlines still left a blank line inside each card. Render cards as normal-flow blocks; keep extra space only between cards. METRIC 1.0000 → 1.0000.
