import { briefingFromSources } from "./neutralize.js";
import { ALL_DROP_PHRASES } from "./lexicon.js";

export function flattenBriefing(briefing) {
  const items = briefing?.items || [];
  const parts = [
    briefing?.briefing_title || "",
    ...items.flatMap((item) => [item.headline, item.summary, item.relevance]),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function scoreBriefing(fixture, briefing) {
  const blob = flattenBriefing(briefing);
  const keepList = fixture.must_keep || [];
  const dropList = fixture.must_drop || [];

  const keepHits = keepList.filter((k) => blob.includes(String(k).toLowerCase()));
  const dropHits = dropList.filter((k) => blob.includes(String(k).toLowerCase()));
  const lexiconHits = ALL_DROP_PHRASES.filter((p) => blob.includes(p.toLowerCase()));

  const keepScore = keepList.length ? keepHits.length / keepList.length : 1;
  const dropScore = dropList.length ? 1 - dropHits.length / dropList.length : 1;
  const lexiconScore = lexiconHits.length === 0 ? 1 : Math.max(0, 1 - lexiconHits.length * 0.15);
  const structureOk =
    Array.isArray(briefing?.items) &&
    briefing.items.length >= 1 &&
    briefing.items.every((item) => item.headline && item.summary);

  const raw = 0.45 * keepScore + 0.4 * dropScore + 0.15 * lexiconScore;
  const score = structureOk ? raw : 0;

  return {
    id: fixture.id,
    score,
    keepScore,
    dropScore,
    lexiconScore,
    structureOk,
    keepHits,
    dropHits,
    lexiconHits,
    itemCount: briefing?.items?.length || 0,
  };
}

export function runCorpus(corpus) {
  const results = corpus.map((fixture) => {
    const briefing = briefingFromSources(fixture.goal, fixture.sources, {
      mode: "eval",
      as_of: "2026-08-15T12:00:00.000Z",
    });
    return { fixture, briefing, ...scoreBriefing(fixture, briefing) };
  });
  const metric =
    results.reduce((sum, row) => sum + row.score, 0) / Math.max(results.length, 1);
  return { metric, results };
}
