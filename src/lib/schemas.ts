import { z } from "zod";

const s = (n: number) => z.string().max(n);
const list = (n = 12, m = 600) => z.array(s(m)).max(n);

export const PersonSchema = z.object({ id: s(80), name: s(80).optional(), linkedin: s(300), instagram: s(300) });
const SourceSchema = z.object({
  source: z.enum(["linkedin", "instagram"]), url: s(300), status: z.enum(["ok", "partial", "failed"]), method: s(120), text: s(9000), note: s(600).optional(),
});
export const SourcesSchema = z.object({ linkedin: SourceSchema, instagram: SourceSchema });
export const ProfileSchemaIn = z.object({
  id: s(80), displayName: s(120), headline: s(500), summary: s(2000), needs: list(), hobbies: list(), interests: list(), values: list(), personality: list(),
  communicationStyle: s(800), lookingForInPartner: s(1200),
  evidence: z.array(z.object({ claim: s(600), source: z.enum(["linkedin", "instagram"]) })).max(12),
  dataQuality: z.enum(["rich", "partial", "minimal", "none"]), caveats: list(),
});
const VerdictIn = z.object({ score: z.number(), reason: s(800), spark: s(600), friction: s(600) });
export const DateIn = z.object({
  a: s(80), b: s(80), turns: z.array(z.object({ speaker: z.enum(["A", "B"]), text: s(1200) })).max(12), aView: VerdictIn, bView: VerdictIn,
});
