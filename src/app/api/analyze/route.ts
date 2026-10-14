import { NextRequest, NextResponse } from "next/server";
import { errorResponse, limited, needLlm } from "@/lib/api";
import { analyzeProfile, emptyProfile } from "@/lib/llm";
import { MistralError } from "@/lib/mistral";
import { PersonSchema, SourcesSchema } from "@/lib/schemas";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const rl = limited(req, "analyze", 20);
  if (rl) return rl;
  const nl = needLlm();
  if (nl) return nl;
  const body = await req.json().catch(() => null);
  const person = PersonSchema.safeParse(body?.person);
  const sources = SourcesSchema.safeParse(body?.sources);
  if (!person.success || !sources.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  try {
    return NextResponse.json({ profile: await analyzeProfile(person.data, sources.data) });
  } catch (e) {
    // Malformed model output (not an API/transport failure): flag it instead of guessing.
    if (!(e instanceof MistralError)) {
      return NextResponse.json({ profile: emptyProfile(person.data, "Analysis failed to produce valid structured output; nothing was guessed.") });
    }
    return errorResponse(e);
  }
}
