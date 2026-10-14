import { NextRequest, NextResponse } from "next/server";
import { errorResponse, limited, needLlm } from "@/lib/api";
import { analyzeProfile, emptyProfile } from "@/lib/llm";
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
    if (e instanceof Error && /no structured output/.test(e.message)) {
      return NextResponse.json({ profile: emptyProfile(person.data, "Analysis failed to produce structured output; nothing was guessed.") });
    }
    return errorResponse(e);
  }
}
