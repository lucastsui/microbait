# Microbait

![Microbait briefing from an X home timeline](docs/intro.gif)

Microbait is a standalone Mac app. It reads your X home timeline in its own window and writes a briefing about which skills are getting cheaper and which ones companies still hire for. Each card is an event from someone you follow, the skill that just got automated, the new demand that remains, and live job ads as proof.

## What you get

- Connect X through Google Chrome so passkeys work, then keep the session on this machine.
- Connect LinkedIn in the right-hand panel so job links open already signed in.
- Brief with the local Grok CLI or the OpenCode API.
- Cards only: **Event**, `[@handle]` summary, **Skill automated**, **New Demand**, then job postings.
- Click an X post or a job ad and it slides in from the right. After a LinkedIn login, the drawer returns to the job you clicked.

Secrets stay on your machine in gitignored `.env` and `~/.microbait/config.json`. Nothing in this repo is an API key or a login.

## Run

```bash
cd ~/code/microbait
npm install
npm start
```

On first launch, open **Setup**:

1. **Connect X** — Chrome opens to the X login. Sign in there.
2. **Connect LinkedIn** — sign in in the right-hand panel.
3. Pick **Grok CLI** or **OpenCode API**. For OpenCode, paste a key from [opencode.ai/auth](https://opencode.ai/auth).

Then ask something like “Recent tech trends”.

Optional overrides in a local `.env` (copy `.env.example`):

- `GROK_BIN`, `GROK_MODEL`, `GROK_REASONING` for the Grok CLI
- `OPENCODE_API_KEY`, `OPENCODE_URL`, `OPENCODE_MODEL` for OpenCode (default model is `big-pickle`)

## Eval

```bash
./eval.sh
```

That runs the unit tests and a frozen bait-corpus metric. Higher is better.

## End-to-end

`npm start` also opens a debug port on `127.0.0.1:9222`. With the app already signed in:

```bash
npm run test:e2e
```

That attaches to the Microbait window, clicks Ask, and prints the briefing.
