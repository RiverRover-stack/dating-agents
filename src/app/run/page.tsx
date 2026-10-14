"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import Workspace from "@/components/Workspace";
import { Empty } from "@/components/views";
import { INPUT_KEY, initialPhases, loadRun, runPipeline, saveRun, type RunInput, type RunState } from "@/lib/client";


const empty = (): RunState => ({ ds: { people: [], dates: [], rankings: [] }, phases: initialPhases(), live: {}, errors: [], finished: false });

export default function RunPage() {
  const [st, setSt] = useState<RunState | null>(null);
  const [none, setNone] = useState(false);
  const started = useRef(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let input: RunInput | null = null;
    try { input = JSON.parse(sessionStorage.getItem(INPUT_KEY) || "null"); sessionStorage.removeItem(INPUT_KEY); } catch { /* ignore */ }
    if (!input) {
      const saved = loadRun();
      if (saved) setSt({ ...empty(), ds: saved, finished: true, phases: initialPhases().map((p) => ({ ...p, state: "done" as const })) });
      else setNone(true);
      return;
    }
    const ac = new AbortController();
    abort.current = ac;
    setSt(empty());
    runPipeline(input, (s) => { setSt(s); if (s.ds.people.length) saveRun(s.ds); }, ac.signal).catch((e) => {
      if (e.name !== "AbortError") setSt((s) => (s ? { ...s, errors: [...s.errors, String(e.message ?? e)], finished: true } : s));
    });
  }, []);

  if (none) return <Empty>No run yet. <Link href="/" className="text-gold underline">Paste some links</Link> to start one.</Empty>;
  if (!st) return <Empty><span className="dot mr-2" />Loading…</Empty>;
  const running = !st.finished;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="eyebrow">Your run</div><h1 className="font-serif text-4xl">{running ? "Agents at work…" : "Run complete"}</h1></div>
        {running ? <button className="btn btn-ghost" onClick={() => { abort.current?.abort(); setSt((s) => s && { ...s, finished: true }); }}>Stop</button> : <Link href="/" className="btn btn-gold">New run</Link>}
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {st.phases.map((p) => (
          <div key={p.key} className={`card p-4 ${p.state === "running" ? "!border-gold/60" : ""}`}>
            <div className="flex items-center justify-between text-sm"><span>{p.label}</span>{p.state === "running" && <span className="dot" />}{p.state === "done" && <span className="text-ok">✓</span>}</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-gold transition-all" style={{ width: `${p.total ? (p.done / p.total) * 100 : p.state === "done" ? 100 : 0}%` }} /></div>
            <div className="mt-1 text-xs text-dim">{p.done}/{p.total}</div>
          </div>
        ))}
      </div>
      {st.errors.length > 0 && (
        <div className="card border-rose/50 p-4 text-sm text-rose" role="alert">
          <b>Some steps had problems</b> (the rest continued):
          <ul className="mt-1 list-disc pl-5">{st.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      <Suspense><Workspace ds={st.ds} set="run" live={st.live} /></Suspense>
    </div>
  );
}
