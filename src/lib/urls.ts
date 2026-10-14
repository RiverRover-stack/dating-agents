import type { PersonInput } from "./types";

const LI = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9%_\-\.]{2,100})\/?(\?.*)?$/i;
const IG = /^https?:\/\/(www\.)?instagram\.com\/([A-Za-z0-9_\.]{1,30})\/?(\?.*)?$/i;

export function normalizeLinkedIn(raw: string): string | null {
  const m = raw.trim().match(LI);
  return m ? `https://www.linkedin.com/in/${m[2]}/` : null;
}
export function normalizeInstagram(raw: string): string | null {
  const m = raw.trim().match(IG);
  if (!m) return null;
  if (["p", "reel", "reels", "explore", "stories", "accounts"].includes(m[2].toLowerCase())) return null;
  return `https://www.instagram.com/${m[2]}/`;
}
export const igHandle = (url: string) => url.match(IG)?.[2] ?? "";
export const liSlug = (url: string) => url.match(LI)?.[2] ?? "";

export function validatePerson(p: { name?: string; linkedin: string; instagram: string }):
  | { ok: true; person: Omit<PersonInput, "id"> }
  | { ok: false; error: string } {
  const linkedin = normalizeLinkedIn(p.linkedin ?? "");
  if (!linkedin) return { ok: false, error: "LinkedIn URL must look like https://www.linkedin.com/in/username" };
  const instagram = normalizeInstagram(p.instagram ?? "");
  if (!instagram) return { ok: false, error: "Instagram URL must look like https://www.instagram.com/username" };
  return { ok: true, person: { name: p.name?.trim().slice(0, 80) || undefined, linkedin, instagram } };
}

export function personId(linkedin: string, instagram: string): string {
  const base = `${liSlug(linkedin)}-${igHandle(instagram)}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return base.slice(0, 60) || "person";
}
