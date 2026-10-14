"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Dataset } from "@/lib/types";
import type { RunState } from "@/lib/client";
import { DatingView, ProfilesGrid, RankingsView, type SetName } from "./views";

const TABS = [["profiles", "1 · Profiles"], ["dating", "2 · Agent dating"], ["rankings", "3 · Rankings"]] as const;

export default function Workspace({ ds, set, live }: { ds: Dataset; set: SetName; live?: RunState["live"] }) {
  const sp = useSearchParams();
  const initial = (sp.get("tab") as (typeof TABS)[number][0]) || "profiles";
  const [tab, setTab] = useState(initial);
  return (
    <div>
      <div className="mb-5 flex gap-2 overflow-x-auto" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`btn whitespace-nowrap ${tab === k ? "btn-gold" : "btn-ghost"}`}>
            {label}{k === "dating" && live && Object.keys(live).length > 0 && <span className="dot" />}
          </button>
        ))}
      </div>
      {tab === "profiles" && <ProfilesGrid ds={ds} set={set} />}
      {tab === "dating" && <DatingView ds={ds} live={live} set={set} />}
      {tab === "rankings" && <RankingsView ds={ds} set={set} initialFor={sp.get("for") ?? undefined} />}
    </div>
  );
}
