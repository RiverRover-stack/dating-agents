# Agentic Dating

Each person is represented by an AI agent. Paste a **public LinkedIn** and a **public Instagram** link per person (the *only* two data sources), and:

1. **Read** - a scraper layer collects public profile data.
2. **Profile** - an analyst agent writes a profile page: needs, hobbies, interests, values, personality, with per-claim evidence and data-quality flags.
3. **Date** - every pair of agents goes on a (streamed, LLM-generated) date on their people's behalf. Each side scores the other, with a spark and a friction point.
4. **Rank** - a matchmaker agent ranks all other people for each person, with a concrete reason drawn from the profiles and the dates.

> Everything the agents say is **AI-generated simulation** built from public data. Nobody is contacted. The UI labels all agent output.

## Pages

| Route | What |
|---|---|
| `/` | Paste links (add several people), validation, optional "also date N cached demo people" |
| `/run` | Live pipeline with progress, **profiles first**, streaming dates, per-person rankings, error/rate-limit reporting |
| `/profile/[id]?set=demo\|run` | Openable profile page per person |
| `/demo` | The pre-run **25-person** showcase (profiles → dates → rankings), loaded instantly from cache |

## Architecture

```
 browser (orchestrator, bounded concurrency, retry/backoff on 429)
   │
   ├─ POST /api/scrape   → scraper layer (Apify → public-metadata fallback)       src/lib/scrape.ts
   ├─ POST /api/analyze  → profile-analyzer agent (Mistral, JSON-schema output)       src/lib/llm.ts
   ├─ POST /api/date     → dating-simulator agent pair (Mistral, NDJSON stream)    src/lib/llm.ts
   └─ POST /api/rank     → ranker agent (Mistral, JSON schema + validation)    src/lib/llm.ts

 data/seed.json   25 real people (name, LinkedIn, Instagram)
 data/demo.json   cached pipeline output for the seed (profiles, 300 dates, rankings)
 scripts/generate-demo.ts   runs the same libs offline, resumable
```

* **Each step is a short serverless call**; the browser fans them out (3 people / 4 dates / 3 rankings concurrently), so a run is never bounded by one function timeout and works for *any* pasted set.
* **Dates** are one conversation per unordered pair (8 turns, ~30-60 words/turn, `effort: low`), streamed to the UI as NDJSON. The same transcript yields two verdicts (A→B and B→A), so 25 people = 300 calls, not 600.
* **Ranking** is a single structured call per person over all other profiles + their date verdicts; the response is validated (every candidate exactly once). If validation fails twice it falls back to a deterministic order from date scores and the UI says so.
* **Persistence:** the demo is a committed JSON file served by `/api/demo`; a user's live run is saved in their browser (`localStorage`) so profile pages and rankings survive navigation. Custom runs may borrow cached demo profiles (and their mutual dates) as dating partners without re-running them.
* **Models:** `mistral-large-latest` by default (`MISTRAL_MODEL`, `MISTRAL_DATE_MODEL`), called over the Mistral chat-completions REST API (`src/lib/mistral.ts`) with retry/backoff on 429/5xx. Profiles and rankings use JSON-schema `response_format` (generated from Zod, then re-validated); dates stream over SSE.

## How scraping works (compliance first)

Only public data; no logins; no bypassing walls/CAPTCHAs/bot protection; no contacting anyone.

1. **Apify actors** (when `APIFY_TOKEN` is set) fetch *public* profile data: `apify/instagram-profile-scraper` for Instagram and a public LinkedIn profile actor (`harvestapi/linkedin-profile-scraper` by default; swap via `APIFY_LINKEDIN_ACTOR`). The token never leaves the server. Results are compacted (noise keys dropped, strings/arrays clamped) before the analyzer sees them.
2. **Fallback - public metadata:** one plain `GET` of the public URL, reading only `og:*`/`description`/JSON-LD tags. If we hit a login wall, authwall redirect, CAPTCHA, or non-200, we **stop** and mark the source `failed`.
3. **Graceful degradation:** a failed source becomes a visible flag on the profile ("Data flag"), `dataQuality` is capped at `partial` in code (not just the prompt) when any source isn't fully OK, and if *both* sources fail no analysis is attempted and the person is not dated - nothing is fabricated.
4. **Pre-scrape + cache:** `npm run generate:demo` scrapes the 25 seed people once and stores sources, profiles, dates and rankings in `data/demo.json`.

URL inputs are strictly validated (`linkedin.com/in/<slug>`, `instagram.com/<handle>`), which also prevents SSRF through the scraper.

## Setup

```bash
npm install                    # required first (installs tsx, next, ...). Needs Node 22+
cp .env.example .env.local     # Windows: copy .env.example .env.local   - then set MISTRAL_API_KEY (+ APIFY_TOKEN)
npm run dev                    # http://localhost:3000
npm run generate:demo          # pre-run the 25 seed people → data/demo.json (LIMIT=6 for a smoke test)
```

| Env var | Required | Purpose |
|---|---|---|
| `MISTRAL_API_KEY` | yes | Mistral API (server-side only) |
| `APIFY_TOKEN` | recommended | Reliable public LinkedIn/Instagram data; without it only public meta tags are used |
| `MISTRAL_MODEL`, `MISTRAL_DATE_MODEL` | no | Model overrides |
| `APIFY_INSTAGRAM_ACTOR`, `APIFY_LINKEDIN_ACTOR` | no | Swap scraping actors |

**Deploy (Vercel):** import the repo, add the env vars, deploy. API routes set `maxDuration` (60-180 s). **Render/other Node hosts:** `npm run build && npm start`.

**Generating the demo in CI:** add repo secrets `MISTRAL_API_KEY` + `APIFY_TOKEN`, then run the *Generate 25-person demo* workflow; it commits `data/demo.json`.

## Guardrails

* Rate limiting per IP on every API route (429 + `retry-after`); the client backs off and retries; model 429s are surfaced the same way.
* Request payloads are schema-validated and size-capped; max 6 people per live run.
* Prompts forbid inferring sensitive attributes and require evidence-grounded, non-fabricated output.
* All agent output is labelled **AI-generated**.

## Seed data note

`data/seed.json` lists 25 public figures (+1 spare) with their LinkedIn and public Instagram URLs. They were chosen from founders, creators and speakers who publish public professional/Instagram profiles. Handles were assembled from public knowledge; the generator records per-source scrape status so any dead/blocked link is flagged in the demo rather than hidden.

## Scripts

`dev`, `build`, `start`, `lint`, `typecheck`, `generate:demo`. A test-only mock of the Mistral API lives in `test/mock-mistral.mjs` for exercising the streaming/parsing plumbing without a key.
