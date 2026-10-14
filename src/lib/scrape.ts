import type { SourceResult, Sources, PersonInput } from "./types";
import { igHandle } from "./urls";

/**
 * Scraper layer. Compliant by construction:
 *  1. Apify actors that collect PUBLIC profile data (token kept server-side), if APIFY_TOKEN is set.
 *  2. Otherwise / on failure: a single plain GET of the public URL, reading only public <meta>/JSON-LD tags.
 *  3. If a login wall, CAPTCHA, or block is hit we STOP and flag the source as failed. We never log in,
 *     rotate proxies, solve CAPTCHAs or otherwise bypass protection, and we never invent data.
 */

const APIFY = "https://api.apify.com/v2";
const IG_ACTOR = process.env.APIFY_INSTAGRAM_ACTOR || "apify/instagram-profile-scraper";
const LI_ACTOR = process.env.APIFY_LINKEDIN_ACTOR || "harvestapi/linkedin-profile-scraper";
const MAX_TEXT = 7000;

const failed = (source: SourceResult["source"], url: string, note: string, method = "none"): SourceResult => ({
  source, url, status: "failed", method, text: "", note,
});

/** Drop noisy keys (urls, ids, images), clamp strings/arrays/depth so the analyzer sees dense signal. */
export function compact(value: unknown, depth = 0): unknown {
  if (value == null) return undefined;
  if (typeof value === "string") return value.length > 700 ? value.slice(0, 700) + "…" : value;
  if (typeof value !== "object") return value;
  if (depth > 4) return undefined;
  if (Array.isArray(value)) {
    const out = value.slice(0, 12).map((v) => compact(v, depth + 1)).filter((v) => v !== undefined && v !== "");
    return out.length ? out : undefined;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/(^|_)(id|pk|url|urls|link|links|image|images|pic|photo|avatar|thumbnail|display|video|hash|cursor|token|urn)($|_)/i.test(k)) continue;
    if (/(url|pic|image|photo|avatar|thumbnail|urn)s?$/i.test(k) && !/external/i.test(k)) continue;
    const c = compact(v, depth + 1);
    if (c !== undefined && c !== "" && !(typeof c === "object" && Object.keys(c as object).length === 0)) out[k] = c;
  }
  return Object.keys(out).length ? out : undefined;
}

async function runActor(actor: string, input: unknown, signal: AbortSignal): Promise<unknown[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN not set");
  const res = await fetch(
    `${APIFY}/acts/${actor.replace("/", "~")}/run-sync-get-dataset-items?timeout=100&format=json`,
    { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(input), signal },
  );
  if (!res.ok) throw new Error(`Apify ${actor} responded ${res.status}`);
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error("Apify returned a non-list payload");
  return items;
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#064;/g, "@");
}

/** Public-metadata fallback: one GET, read og/meta/JSON-LD tags only. Stops at any wall. */
async function publicMetadata(source: SourceResult["source"], url: string, signal: AbortSignal): Promise<SourceResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow", signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; AgenticDatingBot/1.0; public-metadata-only)", "accept-language": "en" },
    });
  } catch (e) {
    return failed(source, url, `Public page fetch failed (${(e as Error).message}).`, "public-metadata");
  }
  if (res.url && /login|authwall|challenge|checkpoint/i.test(res.url)) return failed(source, url, "Login wall on public URL; not bypassed.", "public-metadata");
  if (!res.ok) return failed(source, url, `Public page returned HTTP ${res.status} (blocked or unavailable); not bypassed.`, "public-metadata");
  const html = (await res.text()).slice(0, 600_000);
  if (/captcha|authwall|sign in to view|join linkedin/i.test(html.slice(0, 20_000)) && !/og:description/.test(html)) {
    return failed(source, url, "Bot protection/login wall detected; not bypassed.", "public-metadata");
  }
  const meta = (name: string) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"))
      ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, "i"));
    return m ? decodeEntities(m[1]).trim() : "";
  };
  const parts: string[] = [];
  for (const k of ["og:title", "og:description", "description", "profile:first_name", "profile:last_name"]) {
    const v = meta(k);
    if (v) parts.push(`${k}: ${v}`);
  }
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n").slice(0, 3000);
  if (ld) parts.push(`json-ld: ${ld}`);
  const text = parts.join("\n").slice(0, MAX_TEXT);
  if (text.length < 40) return failed(source, url, "Public page exposed no readable metadata.", "public-metadata");
  return { source, url, status: "partial", method: "public-metadata", text, note: "Only public page metadata was available (no full profile scrape)." };
}

async function scrapeOne(source: SourceResult["source"], url: string): Promise<SourceResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 110_000);
  try {
    if (process.env.APIFY_TOKEN) {
      try {
        const isIg = source === "instagram";
        const input = isIg
          ? { usernames: [igHandle(url)], resultsLimit: 12 }
          // Different LinkedIn actors name this field differently; unknown fields are ignored by Apify.
          : { queries: [url], profileUrls: [url], urls: [url], startUrls: [{ url }], profileScraperMode: "Profile details no email ($4 per 1k)" };
        const items = await runActor(isIg ? IG_ACTOR : LI_ACTOR, input, ac.signal);
        const item = items[0] as Record<string, unknown> | undefined;
        if (!item || (isIg && item.private === true && !item.biography)) throw new Error("empty or private profile");
        if (isIg && item.private === true) {
          return { source, url, status: "partial", method: `apify:${IG_ACTOR}`, text: JSON.stringify(compact(item)).slice(0, MAX_TEXT), note: "Instagram account is private: only public header fields are available." };
        }
        const text = JSON.stringify(compact(item)).slice(0, MAX_TEXT);
        if (text.length < 40) throw new Error("actor returned no usable fields");
        return { source, url, status: "ok", method: `apify:${isIg ? IG_ACTOR : LI_ACTOR}`, text };
      } catch (e) {
        const fb = await publicMetadata(source, url, ac.signal);
        fb.note = `Apify path failed (${(e as Error).message}). ${fb.note ?? ""}`.trim();
        return fb;
      }
    }
    const fb = await publicMetadata(source, url, ac.signal);
    if (fb.status === "failed") fb.note = `${fb.note} Set APIFY_TOKEN for reliable public-profile scraping.`;
    return fb;
  } finally {
    clearTimeout(timer);
  }
}

export async function scrapePerson(p: Pick<PersonInput, "linkedin" | "instagram">): Promise<Sources> {
  const [linkedin, instagram] = await Promise.all([scrapeOne("linkedin", p.linkedin), scrapeOne("instagram", p.instagram)]);
  return { linkedin, instagram };
}
