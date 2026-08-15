import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCorpus } from "../lib/score.js";

const ROOT = dirname(fileURLToPath(new URL(".", import.meta.url)));
const corpus = JSON.parse(readFileSync(join(ROOT, "fixtures", "bait-corpus.json"), "utf8"));
const { metric, results } = runCorpus(corpus);

for (const row of results) {
  const flag = row.score >= 0.75 ? "ok" : "weak";
  console.error(
    `${flag} ${row.id} score=${row.score.toFixed(3)} keep=${row.keepScore.toFixed(2)} drop=${row.dropScore.toFixed(2)} items=${row.itemCount}`,
  );
  if (row.dropHits.length) console.error(`  leftover bait: ${row.dropHits.join(", ")}`);
  if (row.keepHits.length !== (row.fixture.must_keep || []).length) {
    const missing = (row.fixture.must_keep || []).filter(
      (k) => !row.keepHits.includes(k) && !row.keepHits.includes(String(k).toLowerCase()),
    );
    if (missing.length) console.error(`  missing facts: ${missing.join(", ")}`);
  }
}

console.log(metric.toFixed(4));
