import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, limited, needLlm } from "@/lib/api";
import { rankFor } from "@/lib/llm";
import { DateIn, ProfileSchemaIn } from "@/lib/schemas";

export const maxDuration = 120;
const Body = z.object({ me: ProfileSchemaIn, others: z.array(ProfileSchemaIn).max(60), dates: z.array(DateIn).max(80) });

export async function POST(req: NextRequest) {
  const rl = limited(req, "rank", 30);
  if (rl) return rl;
  const nl = needLlm();
  if (nl) return nl;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  try {
    return NextResponse.json({ ranking: await rankFor(body.data.me, body.data.others, body.data.dates) });
  } catch (e) {
    return errorResponse(e);
  }
}
