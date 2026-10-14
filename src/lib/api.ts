import { NextRequest, NextResponse } from "next/server";
import { llmConfigured } from "./llm";
import { MistralError } from "./mistral";

const hits = new Map<string, number[]>();

/** Small in-memory sliding-window limiter (per serverless instance; fine as a courtesy guard). */
export function limited(req: NextRequest, bucket: string, max: number, windowMs = 60_000): NextResponse | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    const retry = Math.ceil((windowMs - (now - arr[0])) / 1000);
    return NextResponse.json({ error: `Rate limit reached. Retry in ${retry}s.`, retryAfter: retry }, { status: 429, headers: { "retry-after": String(retry) } });
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return null;
}

export function needLlm(): NextResponse | null {
  return llmConfigured() ? null : NextResponse.json({ error: "Server is missing MISTRAL_API_KEY, so agents cannot run." }, { status: 503 });
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof MistralError) {
    if (e.status === 429) return NextResponse.json({ error: "The model is rate-limited right now. Retrying shortly.", retryAfter: e.retryAfter ?? 10 }, { status: 429 });
    if (e.status === 503) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: e.status === 502 ? "Could not reach the Mistral API." : `Model API error (${e.status}).` }, { status: 502 });
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
}
