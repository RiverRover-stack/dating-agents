"use client";
import { Suspense, useEffect, useState } from "react";
import Workspace from "@/components/Workspace";
import { Empty } from "@/components/views";
import type { Dataset } from "@/lib/types";

export default function DemoPage() {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  useEffect(() => {
    fetch("/api/demo").then(async (r) => { if (!r.ok) return setState("missing"); setDs(await r.json()); setState("ready"); }).catch(() => setState("missing"));
  }, []);
  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">Pre-run example</div>
        <h1 className="font-serif text-4xl">The 25-person demo</h1>
        <p className="mt-2 max-w-3xl text-dim">Real public figures, each with a LinkedIn and a public Instagram. This is the finished pipeline output - profiles, every pairwise agent date, and per-person rankings - cached so it loads instantly. All of it is AI-generated from public data.</p>
        {ds && <p className="mt-1 text-xs text-dim">{ds.people.length} people · {ds.dates.length} dates · {ds.rankings.length} rankings{ds.generatedAt ? ` · generated ${new Date(ds.generatedAt).toLocaleString()}` : ""}</p>}
      </div>
      {state === "loading" && <Empty><span className="dot mr-2" />Loading demo…</Empty>}
      {state === "missing" && <Empty>The demo dataset has not been generated on this deployment yet (<code>npm run generate:demo</code>). Live runs from the home page still work.</Empty>}
      {ds && <Suspense><Workspace ds={ds} set="demo" /></Suspense>}
    </div>
  );
}
