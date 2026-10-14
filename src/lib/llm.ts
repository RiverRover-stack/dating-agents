import { z } from "zod";
import { chatJson, chatStream } from "./mistral";
import type { DateResult, DateTurn, PersonInput, Profile, RankEntry, Ranking, Sources, Verdict } from "./types";

export const MODEL = process.env.MISTRAL_MODEL || "mistral-large-latest";
// Dates are the volume workload (one per pair). Override with MISTRAL_DATE_MODEL (e.g. mistral-small-latest) to cut cost.
export const DATE_MODEL = process.env.MISTRAL_DATE_MODEL || MODEL;

export const llmConfigured = () => Boolean(process.env.MISTRAL_API_KEY);

const SAFETY = `Ground rules: everything you produce is AI-generated simulation built ONLY from the two public sources provided (a LinkedIn profile and a public Instagram profile). Never invent facts, employers, relationships, locations or events that are not in the sources. Do not infer sensitive attributes (health, religion, sexuality, political views, ethnicity, finances beyond what is publicly stated). When you infer something, phrase it as an inference.`;

/* ───────────── 1. Profile analyzer agent ───────────── */

const ProfileSchema = z.object({
  displayName: z.string(),
  headline: z.string().describe("One line: who they are professionally and personally"),
  summary: z.string().describe("3-4 sentence portrait of the person grounded in the sources"),
  needs: z.array(z.string()).describe("What this person seems to need/want from life, work and a partner, each tied to evidence (3-6)"),
  hobbies: z.array(z.string()).describe("Concrete hobbies/activities visible in the sources (0-8)"),
  interests: z.array(z.string()).describe("Topics and causes they engage with (3-8)"),
  values: z.array(z.string()).describe("Values shown through behavior and content (2-6)"),
  personality: z.array(z.string()).describe("Personality qualities with a short justification each (3-6)"),
  communicationStyle: z.string(),
  lookingForInPartner: z.string().describe("An INFERRED description of what would suit them in a partner; say it is inferred"),
  evidence: z.array(z.object({ claim: z.string(), source: z.enum(["linkedin", "instagram"]) })).describe("4-8 key claims with the source they came from"),
  dataQuality: z.enum(["rich", "partial", "minimal"]),
  caveats: z.array(z.string()).describe("Gaps, thin data, or low-confidence areas"),
});

const ANALYZER_SYSTEM = `You are the Profile Analyst agent in an agentic dating app. You read exactly two public sources about one person - their LinkedIn profile and their public Instagram profile - and write the profile their dating agent will represent.
${SAFETY}
Be specific and observant, not generic: prefer "posts weekly about long-distance running and marathon training" over "likes fitness". Cite the source for key claims. If a source is missing or thin, say so in caveats and keep the affected sections short or empty rather than guessing. Set dataQuality to "rich" only when BOTH sources have substantial content, "partial" when one is missing or thin, "minimal" when you only have a few fields.`;

export function emptyProfile(person: PersonInput, caveat: string): Profile {
  return {
    id: person.id, displayName: person.name || person.id, headline: "Insufficient public data", summary: "",
    needs: [], hobbies: [], interests: [], values: [], personality: [], communicationStyle: "", lookingForInPartner: "",
    evidence: [], dataQuality: "none", caveats: [caveat],
  };
}

export async function analyzeProfile(person: PersonInput, sources: Sources): Promise<Profile> {
  const usable = [sources.linkedin, sources.instagram].filter((s) => s.status !== "failed" && s.text);
  if (!usable.length) {
    return emptyProfile(person, "Both public sources were unavailable (blocked, private, or not found). No analysis was attempted and nothing was guessed.");
  }
  const block = (s: Sources["linkedin"]) =>
    `<${s.source} url="${s.url}" status="${s.status}">\n${s.status === "failed" ? `(unavailable: ${s.note})` : s.text}\n</${s.source}>`;
  const p = await chatJson(ProfileSchema, "profile", {
    model: MODEL, maxTokens: 4000, temperature: 0.3,
    messages: [
      { role: "system", content: ANALYZER_SYSTEM },
      { role: "user", content: `Person name hint: ${person.name ?? "(not given; derive from sources)"}

${block(sources.linkedin)}

${block(sources.instagram)}

Write the profile.` },
    ],
  });
  const caveats = [...p.caveats];
  for (const s of [sources.linkedin, sources.instagram]) {
    if (s.status !== "ok" && s.note) caveats.push(`${s.source}: ${s.note}`);
  }
  // Enforce in code (not just in the prompt): a blocked/partial source can never yield a "rich" profile.
  const allOk = sources.linkedin.status === "ok" && sources.instagram.status === "ok";
  const dataQuality = !allOk && p.dataQuality === "rich" ? "partial" : p.dataQuality;
  return { ...p, id: person.id, caveats, dataQuality };
}

/* ───────────── 2. Dating simulator ───────────── */

const VerdictSchema = z.object({
  score: z.number(),
  reason: z.string(),
  spark: z.string(),
  friction: z.string(),
});
const VerdictsSchema = z.object({ aView: VerdictSchema, bView: VerdictSchema });

const DATE_SYSTEM = `You simulate a first date between two AI dating agents, each representing a real person ON THAT PERSON'S BEHALF. Agent A represents person A, Agent B represents person B. Each agent speaks warmly in the first person AS an advocate who knows their person well ("my person...", or lightly in the person's voice) and is also genuinely probing: it asks real questions, notices where the two profiles connect or clash, and is honest rather than salesy.
${SAFETY}
Conversation rules:
- Exactly 8 turns, alternating A, B, A, B, A, B, A, B. 25-60 words each. Natural, specific, a little witty. No stage directions.
- Ground every claim in the profiles. Reference concrete interests, work, and needs. Surface at least one real point of friction or mismatch and discuss it candidly.
- Do not make anything up about either person beyond the profiles; if something is unknown, an agent may say it doesn't know.
- If a profile is marked as thin, the agent should say its picture is incomplete and lower confidence.
Output format - STRICT:
A: <text>
B: <text>
... (8 lines total)
===VERDICT===
Then a single JSON object: {"aView":{"score":0-100,"reason":"...","spark":"...","friction":"..."},"bView":{...}}
aView is how Agent A rates person B as a match for person A's needs; bView is the reverse. Scores must be differentiated and honest (most pairs 35-80; reserve 85+ for exceptional fit). reason: 1-2 sentences. spark: the best connection point. friction: the biggest mismatch or risk.`;

const brief = (p: Profile) => JSON.stringify({
  name: p.displayName, headline: p.headline, summary: p.summary, needs: p.needs, hobbies: p.hobbies, interests: p.interests,
  values: p.values, personality: p.personality, communicationStyle: p.communicationStyle, lookingForInPartner: p.lookingForInPartner,
  dataQuality: p.dataQuality, caveats: p.caveats,
});

export function parseDate(raw: string, a: string, b: string): DateResult {
  const [convo, verdictRaw] = raw.split("===VERDICT===");
  if (!verdictRaw) throw new Error("Date output missing verdict");
  const turns: DateTurn[] = [];
  for (const line of convo.split("\n")) {
    const m = line.match(/^\s*(A|B):\s*(.+)$/);
    if (m) turns.push({ speaker: m[1] as "A" | "B", text: m[2].trim() });
  }
  if (turns.length < 6) throw new Error(`Date had only ${turns.length} turns`);
  const json = verdictRaw.slice(verdictRaw.indexOf("{"), verdictRaw.lastIndexOf("}") + 1);
  const v = VerdictsSchema.parse(JSON.parse(json));
  const fix = (x: Verdict): Verdict => ({ ...x, score: Math.max(0, Math.min(100, Math.round(x.score))) });
  return { a, b, turns, aView: fix(v.aView), bView: fix(v.bView) };
}

/** Streams the date; onDelta receives only the conversation text (verdict part is withheld). */
export async function runDate(pa: Profile, pb: Profile, onDelta?: (text: string) => void): Promise<DateResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let sent = 0;
      let buf = "";
      const text = await chatStream({
        model: DATE_MODEL, maxTokens: 2500, temperature: 0.85,
        messages: [
          { role: "system", content: DATE_SYSTEM },
          { role: "user", content: `<person_a>\n${brief(pa)}\n</person_a>\n\n<person_b>\n${brief(pb)}\n</person_b>\n\nRun the date between Agent A (for ${pa.displayName}) and Agent B (for ${pb.displayName}).` },
        ],
      }, (t) => {
        buf += t;
        if (!onDelta) return;
        const cut = buf.indexOf("===VERDICT===");
        const visible = cut === -1 ? buf : buf.slice(0, cut);
        // hold back a possible partial marker
        const safe = cut === -1 ? visible.slice(0, Math.max(sent, visible.length - 13)) : visible;
        if (safe.length > sent) { onDelta(safe.slice(sent)); sent = safe.length; }
      });
      const result = parseDate(text, pa.id, pb.id);
      if (onDelta && sent < text.indexOf("===VERDICT===")) onDelta(text.slice(sent, text.indexOf("===VERDICT===")));
      return result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("date failed");
}

/* ───────────── 3. Ranker ───────────── */

const RankSchema = z.object({
  ranking: z.array(z.object({ id: z.string(), score: z.number(), reason: z.string() })),
});

const RANK_SYSTEM = `You are the Matchmaker agent. For ONE person you rank every other candidate from best to worst fit, using that person's profile, each candidate's profile, and the simulated date results (scores, sparks, frictions, and what was said).
${SAFETY}
Rules: include EVERY candidate id exactly once, best first. score is 0-100 overall fit and must be consistent with the order. reason is 1-2 sentences that cite something concrete from the profiles or the date (a shared interest, a quoted exchange, a named friction). Weigh mutual fit - how the candidate's agent rated this person (bView) as well as how this person's agent rated the candidate - and the person's stated/inferred needs. Penalize low data quality only by lowering confidence in the reason, not by inventing detail.`;

export function rankFromDates(forId: string, ids: string[], dates: DateResult[]): Ranking {
  const rows = ids.map((id) => {
    const d = dates.find((x) => (x.a === forId && x.b === id) || (x.b === forId && x.a === id));
    if (!d) return { id, score: 0, reason: "No date was completed for this pair." };
    const mine = d.a === forId ? d.aView : d.bView;
    const theirs = d.a === forId ? d.bView : d.aView;
    return { id, score: Math.round((mine.score * 0.6 + theirs.score * 0.4)), reason: `${mine.reason} Spark: ${mine.spark}` };
  }).sort((x, y) => y.score - x.score);
  return { for: forId, basis: "date-scores", entries: rows.map((r, i): RankEntry => ({ ...r, rank: i + 1 })) };
}

export async function rankFor(me: Profile, others: Profile[], dates: DateResult[]): Promise<Ranking> {
  const ids = others.map((o) => o.id);
  if (!ids.length) return { for: me.id, entries: [], basis: "llm" };
  const cand = others.map((o) => {
    const d = dates.find((x) => (x.a === me.id && x.b === o.id) || (x.b === me.id && x.a === o.id));
    const mine = d && (d.a === me.id ? d.aView : d.bView);
    const theirs = d && (d.a === me.id ? d.bView : d.aView);
    return {
      id: o.id, profile: JSON.parse(brief(o)),
      date: d ? { myAgentRating: mine, theirAgentRating: theirs, excerpt: d.turns.slice(0, 8).map((t) => `${t.speaker === (d.a === me.id ? "A" : "B") ? "my agent" : "their agent"}: ${t.text}`) } : "no date completed",
    };
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = (await chatJson(RankSchema, "ranking", {
        model: MODEL, maxTokens: 6000, temperature: 0.3,
        messages: [
          { role: "system", content: RANK_SYSTEM },
          { role: "user", content: `<person>
${brief(me)}
</person>

<candidates>
${JSON.stringify(cand)}
</candidates>

Rank all ${ids.length} candidates for ${me.displayName}.` },
        ],
      })).ranking;
      if (r && r.length === ids.length && new Set(r.map((x) => x.id)).size === ids.length && r.every((x) => ids.includes(x.id))) {
        return { for: me.id, basis: "llm", entries: r.map((x, i) => ({ id: x.id, rank: i + 1, score: Math.max(0, Math.min(100, Math.round(x.score))), reason: x.reason })) };
      }
    } catch { /* retry once, then fall back */ }
  }
  return rankFromDates(me.id, ids, dates);
}
