/**
 * Pre-runs the REAL pipeline for the seed dataset and caches it in data/demo.json:
 *   scrape (Apify -> public metadata fallback) -> analyze -> date every pair -> rank everyone.
 * Resumable: re-running skips anything already in data/demo.json.
 * Needs MISTRAL_API_KEY (and APIFY_TOKEN for full-profile scraping).
 *   npm run generate:demo            # all seed people
 *   LIMIT=6 npm run generate:demo    # smoke test with the first 6
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeProfile, llmConfigured, rankFor, runDate } from "../src/lib/llm";
import { pool } from "../src/lib/pool";
import { scrapePerson } from "../src/lib/scrape";
import { pairKey, type Dataset, type PersonInput, type PersonRecord } from "../src/lib/types";

const OUT = path.join(process.cwd(), "data", "demo.json");
const C = Number(process.env.CONCURRENCY || 6);

async function main() {
  if (!llmConfigured()) throw new Error("MISTRAL_API_KEY is required");
  let seed: PersonInput[] = JSON.parse(await readFile(path.join(process.cwd(), "data", "seed.json"), "utf8"));
  if (process.env.LIMIT) seed = seed.slice(0, Number(process.env.LIMIT));
  let ds: Dataset = { people: [], dates: [], rankings: [] };
  try { ds = JSON.parse(await readFile(OUT, "utf8")); } catch { /* fresh run */ }
  const save = () => writeFile(OUT, JSON.stringify({ ...ds, generatedAt: new Date().toISOString() }));
  const rec = (id: string) => ds.people.find((p) => p.person.id === id);

  console.log(`[1/4] scrape + analyze ${seed.length} people`);
  await pool(seed, C, async (person) => {
    if (rec(person.id)?.profile) return;
    const r: PersonRecord = { person };
    try {
      r.sources = await scrapePerson(person);
      r.profile = await analyzeProfile(person, r.sources);
      console.log(`  ✓ ${person.name} [${r.profile.dataQuality}] li=${r.sources.linkedin.status} ig=${r.sources.instagram.status}`);
    } catch (e) {
      r.error = (e as Error).message;
      console.log(`  ✗ ${person.name}: ${r.error}`);
    }
    ds.people = ds.people.filter((p) => p.person.id !== person.id).concat(r);
    await save();
  });

  const ready = seed.map((s) => rec(s.id)).filter((r): r is PersonRecord & { profile: NonNullable<PersonRecord["profile"]> } => Boolean(r?.profile && r.profile.dataQuality !== "none"));
  console.log(`[2/4] dating: ${ready.length} datable people`);
  const done = new Set(ds.dates.map((d) => pairKey(d.a, d.b)));
  const pairs: [typeof ready[number], typeof ready[number]][] = [];
  for (let i = 0; i < ready.length; i++) for (let j = i + 1; j < ready.length; j++) if (!done.has(pairKey(ready[i].person.id, ready[j].person.id))) pairs.push([ready[i], ready[j]]);
  console.log(`  ${pairs.length} dates to run (${done.size} cached)`);
  let n = 0;
  await pool(pairs, C, async ([a, b]) => {
    const d = await runDate(a.profile, b.profile);
    ds.dates.push(d);
    if (++n % 5 === 0) { await save(); console.log(`  ${n}/${pairs.length}`); }
  }).then((r) => r.forEach((x) => x instanceof Error && console.log("  date failed:", x.message)));
  await save();

  console.log(`[3/4] ranking`);
  await pool(ready, C, async (me) => {
    if (ds.rankings.some((r) => r.for === me.person.id)) return;
    const others = ready.filter((o) => o !== me).map((o) => o.profile);
    ds.rankings.push(await rankFor(me.profile, others, ds.dates));
    await save();
  }).then((r) => r.forEach((x) => x instanceof Error && console.log("  rank failed:", x.message)));
  await save();
  console.log(`[4/4] done: ${ds.people.length} people, ${ds.dates.length} dates, ${ds.rankings.length} rankings -> ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
