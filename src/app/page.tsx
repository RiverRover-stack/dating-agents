"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { INPUT_KEY, MAX_PEOPLE, clearRun } from "@/lib/client";
import { normalizeInstagram, normalizeLinkedIn } from "@/lib/urls";

type Row = { name: string; linkedin: string; instagram: string };
const blank = (): Row => ({ name: "", linkedin: "", instagram: "" });

export default function Home() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([blank(), blank()]);
  const [pad, setPad] = useState(4);
  const [touched, setTouched] = useState(false);
  const [health, setHealth] = useState<{ llm: boolean; apify: boolean } | null>(null);
  const [demoReady, setDemoReady] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
    fetch("/api/demo").then((r) => setDemoReady(r.ok)).catch(() => setDemoReady(false));
  }, []);

  const set = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const err = (r: Row) => (!normalizeLinkedIn(r.linkedin) ? "LinkedIn: use https://www.linkedin.com/in/username" : !normalizeInstagram(r.instagram) ? "Instagram: use https://www.instagram.com/username" : "");
  const filled = rows.filter((r) => r.linkedin.trim() || r.instagram.trim());
  const valid = filled.length > 0 && filled.every((r) => !err(r));

  function start() {
    setTouched(true);
    if (!valid) return;
    clearRun();
    sessionStorage.setItem(INPUT_KEY, JSON.stringify({ people: filled, includeDemo: demoReady ? pad : 0 }));
    router.push("/run");
  }

  return (
    <div className="space-y-10">
      <section className="pt-6 text-center">
        <div className="eyebrow">Agentic dating</div>
        <h1 className="mx-auto mt-3 max-w-3xl font-serif text-5xl leading-[1.05] sm:text-6xl">Your agent dates <span className="text-gold">so you don&apos;t have to.</span></h1>
        <p className="mx-auto mt-5 max-w-2xl text-dim">Paste a public LinkedIn and a public Instagram link per person. An agent reads both, writes a profile, dates every other agent on that person&apos;s behalf, and ranks who fits best. Those two links are the only data it ever sees.</p>
        <div className="mt-6 flex justify-center gap-3"><Link href="/demo" className="btn btn-ghost">View the 25-person demo →</Link></div>
      </section>

      {health && !health.llm && <div className="card border-rose/50 p-4 text-sm text-rose">This deployment has no ANTHROPIC_API_KEY configured, so live runs are disabled. The demo still works.</div>}

      <section className="card p-6">
        <div className="mb-4 flex items-end justify-between">
          <div><div className="eyebrow">Step 1</div><h2 className="font-serif text-2xl">Who&apos;s dating?</h2></div>
          <span className="text-xs text-dim">up to {MAX_PEOPLE} people per run</span>
        </div>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="rounded-xl border border-line p-3">
              <div className="grid gap-2 md:grid-cols-[1fr_2fr_2fr_auto]">
                <input className="input" placeholder="Name (optional)" value={r.name} onChange={(e) => set(i, "name", e.target.value)} aria-label={`Person ${i + 1} name`} />
                <input className="input" placeholder="https://www.linkedin.com/in/…" value={r.linkedin} onChange={(e) => set(i, "linkedin", e.target.value)} aria-label={`Person ${i + 1} LinkedIn URL`} />
                <input className="input" placeholder="https://www.instagram.com/… (public)" value={r.instagram} onChange={(e) => set(i, "instagram", e.target.value)} aria-label={`Person ${i + 1} Instagram URL`} />
                <button className="btn btn-ghost" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`Remove person ${i + 1}`}>✕</button>
              </div>
              {touched && (r.linkedin || r.instagram || filled.length === 0) && err(r) && <div className="mt-1.5 text-xs text-rose">{err(r)}</div>}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn btn-ghost" disabled={rows.length >= MAX_PEOPLE} onClick={() => setRows((rs) => [...rs, blank()])}>+ Add person</button>
          <label className="flex items-center gap-2 text-sm text-dim">
            Also date
            <select className="input !w-auto !py-1.5" value={pad} onChange={(e) => setPad(Number(e.target.value))} disabled={!demoReady}>
              {[0, 2, 4, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            cached demo people{demoReady === false && " (demo not generated yet)"}
          </label>
          <button className="btn btn-gold ml-auto" onClick={start} disabled={health?.llm === false}>Analyze & start dating →</button>
        </div>
        <p className="mt-4 text-xs text-dim">Only public profiles. We read public profile data via compliant collectors, never log in, never bypass walls or CAPTCHAs, and never contact anyone. If a profile can&apos;t be read, you get a flagged partial profile - nothing is made up.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[["1", "Read", "LinkedIn + public Instagram only"], ["2", "Profile", "Needs, hobbies, interests, qualities - with evidence"], ["3", "Date", "Agents talk, live, on each person's behalf"], ["4", "Rank", "Who fits whom, with reasons"]].map(([n, t, d]) => (
          <div key={n} className="card p-5"><div className="font-serif text-3xl text-gold">{n}</div><div className="mt-1 font-medium">{t}</div><div className="text-sm text-dim">{d}</div></div>
        ))}
      </section>
    </div>
  );
}
