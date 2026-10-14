import { NextResponse } from "next/server";
import { llmConfigured } from "@/lib/llm";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ llm: llmConfigured(), apify: Boolean(process.env.APIFY_TOKEN) });
}
