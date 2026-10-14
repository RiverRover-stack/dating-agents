"use client";
import type { DateResult, Dataset, PersonInput, PersonRecord, Profile, Ranking, Sources } from "./types";
import { pairKey } from "./types";
import { pool } from "./pool";
import { personId, validatePerson } from "./urls";

export const MAX_PEOPLE = 6;
export const INPUT_KEY = "agentic-dating:input";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ApiError extends Error {
  constructor(message: string, public status: number, public retryAfter?: number) { super(message); }
}

/** JSON POST with retry/backoff on rate limits and transient upstream errors. */
export async function post<T>(url: string, body: unknown, signal?: AbortSignal, tries = 4): Promise<T> {
  let last: ApiError | null = null;
  for (let i = 0; i < tries; i++) {
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      last = new ApiError("Network error", 0);
      await sleep(1500 * (i + 1));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data as T;
    last = new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.retryAfter);
    if (res.status === 429 || res.status === 502) {
      await sleep(Math.min(30, last.retryAfter ?? 4 * (i + 1)) * 1000);
      continue;
    }
    throw last;
  }
  throw last ?? new ApiError("Request failed", 0);
}

/** Streams one date. onDelta gets raw conversation text as it is generated. */
export async function streamDate(a: Profile, b: Profile, onDelta: (t: string) => void, signal?: AbortSignal): Promise<DateResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("/api/date", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a, b }), signal });
    if (res.status === 429) {
      const j = await res.json().catch(() => ({}));
      await sleep(Math.min(30, j.retryAfter ?? 5 * (attempt + 1)) * 1000);
      continue;
    }
    if (!res.ok || !res.body) throw new ApiError((await res.json().catch(() => ({}))).error || `Date failed (${res.status})`, res.status);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.type === "delta") onDelta(ev.text);
        else if (ev.type === "done") return ev.date as DateResult;
        else if (ev.type === "error") {
          if (ev.retryAfter) { await sleep(ev.retryAfter * 1000); break; }
          throw new ApiError(ev.error, 500);
        }
      }
    }
  }
  throw new ApiError("Date did not complete after retries", 500);
}

/* ───────── persistence of the "run" dataset (browser only) ───────── */
const KEY = "agentic-dating:run:v1";
export function loadRun(): Dataset | null {
  try { const r = localStorage.getItem(KEY); return r ? (JSON.parse(r) as Dataset) : null; } catch { return null; }
}
export function saveRun(d: Dataset) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* quota / private mode */ } }
export function clearRun() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

export type Phase = { key: "scrape" | "analyze" | "date" | "rank"; label: string; done: number; total: number; state: "idle" | "running" | "done" };
export type RunState = {
  ds: Dataset;
  phases: Phase[];
  /** live partial transcripts keyed by pairKey */
  live: Record<string, { a: string; b: string; text: string }>;
  errors: string[];
  finished: boolean;
};
export type RunInput = { people: { name?: string; linkedin: string; instagram: string }[]; includeDemo: number };

export const initialPhases = (): Phase[] => [
  { key: "scrape", label: "Reading public LinkedIn + Instagram", done: 0, total: 0, state: "idle" },
  { key: "analyze", label: "Agents analyzing people", done: 0, total: 0, state: "idle" },
  { key: "date", label: "Agents dating", done: 0, total: 0, state: "idle" },
  { key: "rank", label: "Ranking matches", done: 0, total: 0, state: "idle" },
];

/** The whole pipeline, orchestrated from the browser so each step is a short serverless call. */
export async function runPipeline(input: RunInput, emit: (s: RunState) => void, signal: AbortSignal) {
  const st: RunState = { ds: { people: [], dates: [], rankings: [] }, phases: initialPhases(), live: {}, errors: [], finished: false };
  const push = () => emit({ ...st, ds: { ...st.ds }, phases: st.phases.map((p) => ({ ...p })), live: { ...st.live }, errors: [...st.errors] });
  const phase = (k: Phase["key"]) => st.phases.find((p) => p.key === k)!;
  const upsert = (r: PersonRecord) => { st.ds.people = st.ds.people.filter((p) => p.person.id !== r.person.id).concat(r); };

  // normalise + dedupe input
  const seen = new Set<string>();
  const mine: PersonInput[] = [];
  for (const p of input.people) {
    const v = validatePerson(p);
    if (!v.ok) { st.errors.push(v.error); continue; }
    let id = personId(v.person.linkedin, v.person.instagram);
    while (seen.has(id)) id += "-2";
    seen.add(id);
    mine.push({ id, ...v.person });
  }
  if (!mine.length) { st.errors.push("No valid people to run."); st.finished = true; push(); return; }
  for (const m of mine) upsert({ person: m });

  // 1+2. scrape then analyze, per person, so profiles appear as soon as each one finishes
  phase("scrape").total = phase("analyze").total = mine.length;
  phase("scrape").state = "running"; phase("analyze").state = "running"; push();
  await pool(mine, 3, async (person) => {
    const rec: PersonRecord = { person };
    try {
      const sc = await post<{ sources: Sources }>("/api/scrape", person, signal);
      rec.sources = sc.sources;
      phase("scrape").done++; upsert(rec); push();
      const an = await post<{ profile: Profile }>("/api/analyze", { person, sources: sc.sources }, signal);
      rec.profile = an.profile;
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      rec.error = (e as Error).message;
      st.errors.push(`${person.name ?? person.id}: ${rec.error}`);
      if (!rec.sources) phase("scrape").done++;
    }
    phase("analyze").done++; upsert(rec); push();
  });
  phase("scrape").state = phase("analyze").state = "done"; push();

  // optionally pad the pool with cached demo people (their profiles + mutual dates are reused, not re-run)
  if (input.includeDemo > 0) {
    try {
      const demo: Dataset = await (await fetch("/api/demo", { signal })).json();
      if (demo.people) {
        const pick = demo.people.filter((r) => r.profile && r.profile.dataQuality !== "none" && !seen.has(r.person.id)).slice(0, input.includeDemo);
        for (const r of pick) upsert(r);
        const ids = new Set(pick.map((r) => r.person.id));
        st.ds.dates.push(...demo.dates.filter((d) => ids.has(d.a) && ids.has(d.b)));
        push();
      }
    } catch { st.errors.push("Could not load demo people to pad the pool."); }
  }

  const ready = st.ds.people.filter((r) => r.profile && r.profile.dataQuality !== "none") as (PersonRecord & { profile: Profile })[];
  const mineReady = ready.filter((r) => seen.has(r.person.id));

  // 3. dating: every pair that includes at least one of the user's people
  const have = new Set(st.ds.dates.map((d) => pairKey(d.a, d.b)));
  const pairs: [Profile, Profile][] = [];
  for (let i = 0; i < ready.length; i++) for (let j = i + 1; j < ready.length; j++) {
    const [x, y] = [ready[i], ready[j]];
    if (!seen.has(x.person.id) && !seen.has(y.person.id)) continue;
    if (!have.has(pairKey(x.person.id, y.person.id))) pairs.push([x.profile, y.profile]);
  }
  const dt = phase("date");
  dt.total = pairs.length; dt.state = pairs.length ? "running" : "done"; push();
  await pool(pairs, 4, async ([a, b]) => {
    const key = pairKey(a.id, b.id);
    st.live[key] = { a: a.id, b: b.id, text: "" };
    push();
    try {
      const date = await streamDate(a, b, (t) => { st.live[key].text += t; push(); }, signal);
      st.ds.dates.push(date);
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      st.errors.push(`Date ${a.displayName} × ${b.displayName}: ${(e as Error).message}`);
    }
    delete st.live[key]; dt.done++; push();
  });
  dt.state = "done"; push();

  // 4. ranking for each of the user's people
  const rk = phase("rank");
  rk.total = mineReady.length; rk.state = "running"; push();
  await pool(mineReady, 3, async (r) => {
    try {
      const others = ready.filter((o) => o !== r).map((o) => o.profile);
      const dates = st.ds.dates.filter((d) => d.a === r.person.id || d.b === r.person.id);
      const { ranking } = await post<{ ranking: Ranking }>("/api/rank", { me: r.profile, others, dates }, signal);
      st.ds.rankings.push(ranking);
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      st.errors.push(`Ranking for ${r.profile.displayName}: ${(e as Error).message}`);
    }
    rk.done++; push();
  });
  rk.state = "done"; st.finished = true; st.ds.generatedAt = new Date().toISOString(); push();
}
