import { NextRequest, NextResponse } from "next/server";
import { limited } from "@/lib/api";
import { scrapePerson } from "@/lib/scrape";
import { validatePerson } from "@/lib/urls";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const rl = limited(req, "scrape", 12);
  if (rl) return rl;
  const body = await req.json().catch(() => null);
  const v = validatePerson({ name: body?.name, linkedin: String(body?.linkedin ?? ""), instagram: String(body?.instagram ?? "") });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const sources = await scrapePerson(v.person);
  return NextResponse.json({ person: v.person, sources });
}
