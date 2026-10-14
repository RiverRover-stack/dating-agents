"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { DateResult, DateTurn, Dataset, PersonRecord } from "@/lib/types";
import { pairKey } from "@/lib/types";
import type { RunState } from "@/lib/client";
import { AiBadge, Avatar, Chips, ProfileLink, QualityBadge, Score } from "./ui";

export type SetName = "demo" | "run";
const nameMap = (ds: Dataset) => new Map(ds.people.map((p) => [p.person.id, p.profile?.displayName || p.person.name || p.person.id]));

/* ───────────── Profiles ───────────── */
export function ProfilesGrid({ ds, set }: { ds: Dataset; set: SetName }) {
  if (!ds.people.length) return <Empty>No profiles yet.</Empty>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ds.people.map((r) => <ProfileCard key={r.person.id} r={r} set={set} />)}
    </div>
  );
}

function ProfileCard({ r, set }: { r: PersonRecord; set: SetName }) {
  const p = r.profile;
  const name = p?.displayName || r.person.name || r.person.id;
  return (
    <Link href={`/profile/${r.person.id}?set=${set}`} className="card block p-5 transition hover:border-gold/60">
      <div className="flex items-center gap-3">
        <Avatar name={name} />
        <div className="min-w-0">
          <div className="truncate font-serif text-lg">{name}</div>
          <div className="truncate text-xs text-dim">{p?.headline || (r.error ? "Analysis failed" : "Reading public profiles…")}</div>
        </div>
      </div>
      {p ? (
        <>
          <p className="mt-3 line-clamp-3 text-sm text-dim">{p.summary || p.caveats[0]}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">{p.interests.slice(0, 3).map((i) => <span key={i} className="chip">{i}</span>)}</div>
          <div className="mt-3"><QualityBadge q={p.dataQuality} /></div>
        </>
      ) : <div className="mt-4 flex items-center gap-2 text-sm text-dim">{r.error ? <span className="text-rose">{r.error}</span> : <><span className="dot" /> working…</>}</div>}
    </Link>
  );
}

export function ProfileDetail({ r, ds, set }: { r: PersonRecord; ds: Dataset; set: SetName }) {
  const p = r.profile;
  const names = nameMap(ds);
  const name = p?.displayName || r.person.name || r.person.id;
  const rank = ds.rankings.find((x) => x.for === r.person.id);
  return (
    <div className="space-y-6">
      <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        <Avatar name={name} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="font-serif text-3xl">{name}</h1><AiBadge />{p && <QualityBadge q={p.dataQuality} />}</div>
          <p className="mt-1 text-dim">{p?.headline}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <a className="text-sky hover:underline" href={r.person.linkedin} target="_blank" rel="noreferrer">LinkedIn ↗</a>
            <a className="text-rose hover:underline" href={r.person.instagram} target="_blank" rel="noreferrer">Instagram ↗</a>
          </div>
        </div>
      </div>
      {!p && <Empty>{r.error ?? "Profile not ready yet."}</Empty>}
      {p && (
        <>
          {p.dataQuality !== "rich" && (
            <div className="card border-gold/40 p-4 text-sm">
              <b className="text-gold">Data flag:</b> this profile is built from {p.dataQuality === "none" ? "no usable" : "incomplete"} public data and nothing was guessed to fill the gaps.
              <ul className="mt-1 list-disc pl-5 text-dim">{p.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}
          {p.summary && <Section title="Portrait"><p className="leading-relaxed text-ink/90">{p.summary}</p></Section>}
          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Needs"><List items={p.needs} /></Section>
            <Section title="Looking for (inferred)"><p className="text-sm text-ink/90">{p.lookingForInPartner || "-"}</p></Section>
            <Section title="Hobbies"><Chips items={p.hobbies} tone="gold" /></Section>
            <Section title="Interests"><Chips items={p.interests} tone="sky" /></Section>
            <Section title="Values"><Chips items={p.values} tone="rose" /></Section>
            <Section title="Personality"><List items={p.personality} /></Section>
            <Section title="Communication style"><p className="text-sm text-ink/90">{p.communicationStyle || "-"}</p></Section>
            <Section title="Evidence from public sources">
              <ul className="space-y-1.5 text-sm">{p.evidence.map((e, i) => <li key={i}><span className={`chip mr-2 ${e.source === "linkedin" ? "!text-sky" : "!text-rose"}`}>{e.source}</span>{e.claim}</li>)}</ul>
            </Section>
          </div>
          {r.sources && (
            <Section title="How this was read">
              <div className="grid gap-2 text-sm text-dim sm:grid-cols-2">
                {[r.sources.linkedin, r.sources.instagram].map((s) => (
                  <div key={s.source}><b className="text-ink">{s.source}</b>: {s.status} via {s.method}{s.note ? <div className="text-xs">{s.note}</div> : null}</div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
      {rank && (
        <Section title="Best matches">
          <ol className="space-y-2">{rank.entries.slice(0, 3).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 text-sm"><span><b>{e.rank}.</b> <ProfileLink id={e.id} set={set}>{names.get(e.id)}</ProfileLink> <span className="text-dim">- {e.reason}</span></span><Score v={e.score} /></li>
          ))}</ol>
          <Link href={`/${set === "demo" ? "demo" : "run"}?tab=rankings&for=${r.person.id}`} className="mt-3 inline-block text-sm text-gold hover:underline">Full ranking →</Link>
        </Section>
      )}
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="card p-5"><div className="eyebrow mb-3">{title}</div>{children}</section>
);
const List = ({ items }: { items: string[] }) => items.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-ink/90">{items.map((i, k) => <li key={k}>{i}</li>)}</ul> : <span className="text-sm text-dim">Nothing found in the public data.</span>;
export const Empty = ({ children }: { children: React.ReactNode }) => <div className="card p-8 text-center text-dim">{children}</div>;

/* ───────────── Dating ───────────── */
/** Parse partially streamed "A: ... \n B: ..." text into turns. */
export function parseLive(text: string): DateTurn[] {
  const out: DateTurn[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(A|B):\s*(.*)$/);
    if (m) out.push({ speaker: m[1] as "A" | "B", text: m[2] });
  }
  return out;
}

export function DatingView({ ds, live = {}, set }: { ds: Dataset; live?: RunState["live"]; set: SetName }) {
  const names = useMemo(() => nameMap(ds), [ds]);
  const [who, setWho] = useState("all");
  const [sel, setSel] = useState<string | null>(null);
  const liveKeys = Object.keys(live);
  const dates = ds.dates.filter((d) => who === "all" || d.a === who || d.b === who);
  const selectedKey = sel ?? liveKeys[0] ?? (dates[0] ? pairKey(dates[0].a, dates[0].b) : null);
  const selDate = ds.dates.find((d) => pairKey(d.a, d.b) === selectedKey);
  const selLive = selectedKey ? live[selectedKey] : undefined;

  if (!ds.dates.length && !liveKeys.length) return <Empty>No dates yet - they start after profiles are analyzed.</Empty>;
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-3">
        <select className="input" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by person">
          <option value="all">All dates ({ds.dates.length})</option>
          {ds.people.filter((p) => p.profile && p.profile.dataQuality !== "none").map((p) => <option key={p.person.id} value={p.person.id}>{names.get(p.person.id)}</option>)}
        </select>
        <div className="card max-h-[70vh] divide-y divide-line overflow-auto">
          {liveKeys.map((k) => (
            <button key={k} onClick={() => setSel(k)} className={`block w-full p-3 text-left text-sm hover:bg-panel2 ${selectedKey === k ? "bg-panel2" : ""}`}>
              <span className="dot mr-2" />{names.get(live[k].a)} × {names.get(live[k].b)}<div className="text-xs text-gold">on a date right now…</div>
            </button>
          ))}
          {dates.map((d) => {
            const k = pairKey(d.a, d.b);
            return (
              <button key={k} onClick={() => setSel(k)} className={`block w-full p-3 text-left text-sm hover:bg-panel2 ${selectedKey === k ? "bg-panel2" : ""}`}>
                <div>{names.get(d.a)} × {names.get(d.b)}</div>
                <div className="text-xs text-dim">{d.aView.score} / {d.bView.score} mutual</div>
              </button>
            );
          })}
        </div>
      </aside>
      <div>
        {selLive ? <Transcript a={selLive.a} b={selLive.b} turns={parseLive(selLive.text)} names={names} live set={set} />
          : selDate ? <Transcript a={selDate.a} b={selDate.b} turns={selDate.turns} names={names} date={selDate} set={set} />
          : <Empty>Pick a date on the left.</Empty>}
      </div>
    </div>
  );
}

function Transcript({ a, b, turns, names, date, live, set }: { a: string; b: string; turns: DateTurn[]; names: Map<string, string>; date?: DateResult; live?: boolean; set: SetName }) {
  const A = names.get(a) ?? a, B = names.get(b) ?? b;
  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h3 className="font-serif text-xl"><ProfileLink id={a} set={set}>{A}</ProfileLink>&apos;s agent × <ProfileLink id={b} set={set}>{B}</ProfileLink>&apos;s agent</h3>
        <AiBadge />{live && <span className="chip !text-gold"><span className="dot mr-1.5" />live</span>}
      </div>
      <div className="space-y-3">
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.speaker === "B" ? "justify-end" : ""}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${t.speaker === "A" ? "bg-panel2" : "bg-gold/10 border border-gold/20"} ${live && i === turns.length - 1 ? "caret" : ""}`}>
              <div className="mb-0.5 text-[11px] uppercase tracking-wider text-dim">{t.speaker === "A" ? A : B}&apos;s agent</div>
              {t.text}
            </div>
          </div>
        ))}
        {live && !turns.length && <div className="text-sm text-dim"><span className="dot mr-2" />Agents are being introduced…</div>}
      </div>
      {date && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[{ who: A, other: B, v: date.aView }, { who: B, other: A, v: date.bView }].map((x) => (
            <div key={x.who} className="rounded-xl border border-line p-4 text-sm">
              <div className="mb-1 flex items-center justify-between"><span className="eyebrow">{x.who}&apos;s agent on {x.other}</span><Score v={x.v.score} /></div>
              <p>{x.v.reason}</p>
              <p className="mt-2 text-ok">✦ {x.v.spark}</p>
              <p className="mt-1 text-rose">⚠ {x.v.friction}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────── Rankings ───────────── */
export function RankingsView({ ds, set, initialFor }: { ds: Dataset; set: SetName; initialFor?: string }) {
  const names = useMemo(() => nameMap(ds), [ds]);
  const withRank = ds.rankings.filter((r) => names.has(r.for));
  const [sel, setSel] = useState(initialFor && withRank.some((r) => r.for === initialFor) ? initialFor : withRank[0]?.for);
  if (!withRank.length) return <Empty>Rankings appear once the dates finish.</Empty>;
  const r = withRank.find((x) => x.for === (sel ?? withRank[0].for))!;
  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <aside className="card max-h-[75vh] divide-y divide-line overflow-auto">
        {withRank.map((x) => (
          <button key={x.for} onClick={() => setSel(x.for)} className={`flex w-full items-center gap-3 p-3 text-left text-sm hover:bg-panel2 ${x.for === r.for ? "bg-panel2" : ""}`}>
            <Avatar name={names.get(x.for)!} size={30} /><span className="truncate">{names.get(x.for)}</span>
          </button>
        ))}
      </aside>
      <section className="card p-5">
        <div className="mb-1 flex flex-wrap items-center gap-2"><h2 className="font-serif text-2xl">Best fits for <ProfileLink id={r.for} set={set}>{names.get(r.for)}</ProfileLink></h2><AiBadge /></div>
        {r.basis === "date-scores" && <p className="mb-2 text-xs text-gold">Ranker could not return a valid list, so this order is computed from the date scores.</p>}
        <ol className="mt-4 space-y-3">
          {r.entries.map((e) => (
            <li key={e.id} className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3"><span className="w-6 font-serif text-xl text-gold">{e.rank}</span><Avatar name={names.get(e.id) ?? e.id} size={34} /><ProfileLink id={e.id} set={set}><span className="truncate font-medium">{names.get(e.id)}</span></ProfileLink></div>
                <Score v={e.score} />
              </div>
              <p className="mt-2 text-sm text-dim">{e.reason}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
