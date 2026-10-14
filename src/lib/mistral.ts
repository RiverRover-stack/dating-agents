import { z } from "zod";

const BASE = (process.env.MISTRAL_BASE_URL || "https://api.mistral.ai").replace(/\/$/, "");

export class MistralError extends Error {
  constructor(message: string, public status: number, public retryAfter?: number) { super(message); }
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type Opts = { model: string; messages: ChatMessage[]; maxTokens?: number; temperature?: number; signal?: AbortSignal };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key = () => {
  const k = process.env.MISTRAL_API_KEY;
  if (!k) throw new MistralError("MISTRAL_API_KEY is not set", 503);
  return k;
};

/** POST with retry/backoff on 429 / 5xx / network errors. Returns the open Response. */
async function request(body: Record<string, unknown>, signal?: AbortSignal, tries = 4): Promise<Response> {
  let last: MistralError | null = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE}/v1/chat/completions`, {
        method: "POST", signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key()}` },
        body: JSON.stringify(body),
      });
      if (res.ok) return res;
      const retryAfter = Number(res.headers.get("retry-after")) || undefined;
      last = new MistralError(`Mistral API error (${res.status})`, res.status, retryAfter);
      if (res.status !== 429 && res.status < 500) throw last;
      if (i < tries - 1) await sleep(Math.min(20, retryAfter ?? 2 ** (i + 1)) * 1000);
    } catch (e) {
      if (e instanceof MistralError && e.status !== 429 && e.status < 500) throw e;
      if ((e as Error).name === "AbortError") throw e;
      last = e instanceof MistralError ? e : new MistralError("Could not reach the Mistral API", 502);
      if (i < tries - 1) await sleep(2 ** (i + 1) * 1000);
    }
  }
  throw last ?? new MistralError("Mistral request failed", 502);
}

/** Structured output: JSON-schema constrained, then validated again with Zod. */
export async function chatJson<T extends z.ZodType>(schema: T, name: string, o: Opts): Promise<z.infer<T>> {
  const res = await request({
    model: o.model, messages: o.messages, max_tokens: o.maxTokens ?? 8000, temperature: o.temperature ?? 0.3,
    response_format: { type: "json_schema", json_schema: { name, strict: true, schema: z.toJSONSchema(schema) } },
  }, o.signal);
  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) throw new MistralError("Mistral returned no content", 502);
  return schema.parse(JSON.parse(text));
}

/** Streams plain text; onText receives each delta. Resolves with the full text. */
export async function chatStream(o: Opts, onText?: (t: string) => void): Promise<string> {
  const res = await request({ model: o.model, messages: o.messages, max_tokens: o.maxTokens ?? 4000, temperature: o.temperature ?? 0.8, stream: true }, o.signal);
  if (!res.body) throw new MistralError("No stream body", 502);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const piece: string = JSON.parse(payload)?.choices?.[0]?.delta?.content ?? "";
        if (piece) { full += piece; onText?.(piece); }
      } catch { /* ignore keep-alive / partial frames */ }
    }
  }
  return full;
}
