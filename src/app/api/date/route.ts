import { NextRequest, NextResponse } from "next/server";
import { errorResponse, limited, needLlm } from "@/lib/api";
import { runDate } from "@/lib/llm";
import { ProfileSchemaIn } from "@/lib/schemas";

export const maxDuration = 180;

/** NDJSON stream: {type:"delta",text} ... then {type:"done",date} or {type:"error",error,retryAfter?} */
export async function POST(req: NextRequest) {
  const rl = limited(req, "date", 140);
  if (rl) return rl;
  const nl = needLlm();
  if (nl) return nl;
  const body = await req.json().catch(() => null);
  const a = ProfileSchemaIn.safeParse(body?.a);
  const b = ProfileSchemaIn.safeParse(body?.b);
  if (!a.success || !b.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  if (a.data.dataQuality === "none" || b.data.dataQuality === "none") return NextResponse.json({ error: "Cannot date a profile with no data" }, { status: 422 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const date = await runDate(a.data, b.data, (text) => send({ type: "delta", text }));
        send({ type: "done", date });
      } catch (e) {
        const r = errorResponse(e);
        const j = await r.json();
        send({ type: "error", ...j });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
