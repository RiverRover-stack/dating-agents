"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Empty, ProfileDetail, type SetName } from "@/components/views";
import { loadRun } from "@/lib/client";
import type { Dataset } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function Inner({ id }: { id: string }) {
  const set = (useSearchParams().get("set") === "run" ? "run" : "demo") as SetName;
  const [ds, setDs] = useState<Dataset | null | undefined>(undefined);
  useEffect(() => {
    if (set === "run") setDs(loadRun());
    else fetch("/api/demo").then((r) => (r.ok ? r.json() : null)).then(setDs).catch(() => setDs(null));
  }, [set]);
  const rec = ds?.people.find((p) => p.person.id === id);
  return (
    <div className="space-y-5">
      <Link href={set === "run" ? "/run" : "/demo"} className="text-sm text-dim hover:text-gold">← Back to {set === "run" ? "my run" : "demo"}</Link>
      {ds === undefined ? <Empty><span className="dot mr-2" />Loading…</Empty> : !ds || !rec ? <Empty>Profile not found in this {set === "run" ? "browser session" : "demo"}.</Empty> : <ProfileDetail r={rec} ds={ds} set={set} />}
    </div>
  );
}

export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><Inner id={id} /></Suspense>;
}
