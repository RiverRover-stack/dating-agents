import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-static";

export async function GET() {
  try {
    const raw = await readFile(path.join(process.cwd(), "data", "demo.json"), "utf8");
    return new NextResponse(raw, { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({ available: false }, { status: 404 });
  }
}
