# Microbait

improvable: true

## Goal
Turn a user's information goal into a short public-source briefing that keeps facts and drops ads, shockbait, and sentiment padding.

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
Site runs locally at http://127.0.0.1:3847. Eval is green at 1.0000 on the frozen bait corpus (ceiling for this set). Next useful work is a harder corpus or live-source reliability, not inflating this number. Live Grok search needs XAI_API_KEY. Private friend graphs are not connected.

## Lessons
- 2026-08-15: Started from a product idea, not a metric. Chose a frozen bait corpus so "calmer voice" can be scored without a live social login.
