import Link from "next/link";
import type { Profile } from "@/lib/types";

export const AiBadge = () => <span className="chip !border-gold/40 !text-gold">AI-generated</span>;

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const ini = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-serif" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${h} 35% 22%)`, border: `1px solid hsl(${h} 40% 40%)` }}>{ini}</span>
  );
}

export function Chips({ items, tone }: { items: string[]; tone?: "gold" | "rose" | "sky" }) {
  if (!items.length) return <span className="text-sm text-dim">Nothing found in the public data.</span>;
  const c = tone === "gold" ? "!border-gold/40" : tone === "rose" ? "!border-rose/40" : tone === "sky" ? "!border-sky/40" : "";
  return <div className="flex flex-wrap gap-1.5">{items.map((i, k) => <span key={k} className={`chip ${c}`}>{i}</span>)}</div>;
}

export function QualityBadge({ q }: { q: Profile["dataQuality"] }) {
  const map = { rich: ["Rich data", "text-ok"], partial: ["Partial data", "text-gold"], minimal: ["Minimal data", "text-rose"], none: ["No data", "text-rose"] } as const;
  return <span className={`chip ${map[q][1]}`}>{map[q][0]}</span>;
}

export function Score({ v }: { v: number }) {
  const color = v >= 75 ? "var(--color-ok)" : v >= 55 ? "var(--color-gold)" : "var(--color-rose)";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full" style={{ width: `${v}%`, background: color }} /></div>
      <span className="w-7 text-right text-sm tabular-nums" style={{ color }}>{v}</span>
    </div>
  );
}

export const ProfileLink = ({ id, set, children }: { id: string; set: string; children: React.ReactNode }) => (
  <Link href={`/profile/${id}?set=${set}`} className="hover:text-gold">{children}</Link>
);
