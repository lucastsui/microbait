# Microbait

A small website that reads the public internet on your behalf and hands back a briefing instead of a feed.

You write a goal such as "I want to know recent tech development" or "how are my friends doing." The desk gathers public posts and news, removes ads and shock language, and writes what remains in a flat voice.

## What is real today

- A landing page and a briefing desk at `http://127.0.0.1:3847`
- Saved goals on this machine
- Public sources: Hacker News, RSS, and Reddit when they answer
- A local stripper that drops ads, shout, emoji, and bait phrases
- Optional live path: Grok on SpaceXAI with `web_search` and `x_search`

## What is not pretended

Private friend graphs are closed. Facebook stories, locked Instagram, and DMs need those companies' logins. You can list public X usernames. Grok can search those when `XAI_API_KEY` is set.

## Run

```bash
cd ~/code/microbait
cp .env.example .env   # optional, add XAI_API_KEY for live web + X
npm start
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847).

## Eval

```bash
./eval.sh
```

The last line is `METRIC=<float>`. Higher is a cleaner briefing on the frozen bait corpus.

## Stack

No npm dependencies. Node 20+, static pages, a small HTTP server, and `https://api.x.ai/v1/responses` when a key is present.
