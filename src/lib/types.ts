export type PersonInput = { id: string; name?: string; linkedin: string; instagram: string };

export type SourceStatus = "ok" | "partial" | "failed";
export type SourceResult = {
  source: "linkedin" | "instagram";
  url: string;
  status: SourceStatus;
  /** how the data was obtained: "apify:<actor>" | "public-metadata" | "none" */
  method: string;
  /** compact text handed to the analyzer agent. Never contains invented data. */
  text: string;
  note?: string;
};
export type Sources = { linkedin: SourceResult; instagram: SourceResult };

export type Profile = {
  id: string;
  displayName: string;
  headline: string;
  summary: string;
  needs: string[];
  hobbies: string[];
  interests: string[];
  values: string[];
  personality: string[];
  communicationStyle: string;
  lookingForInPartner: string;
  evidence: { claim: string; source: "linkedin" | "instagram" }[];
  dataQuality: "rich" | "partial" | "minimal" | "none";
  caveats: string[];
};

export type DateTurn = { speaker: "A" | "B"; text: string };
export type Verdict = { score: number; reason: string; spark: string; friction: string };
export type DateResult = {
  a: string; // person id (agent A)
  b: string; // person id (agent B)
  turns: DateTurn[];
  aView: Verdict; // how A's agent rates B
  bView: Verdict; // how B's agent rates A
};

export type RankEntry = { id: string; rank: number; score: number; reason: string };
export type Ranking = { for: string; entries: RankEntry[]; basis: "llm" | "date-scores" };

export type PersonRecord = {
  person: PersonInput;
  sources?: Sources;
  profile?: Profile;
  error?: string;
};

export type Dataset = {
  generatedAt?: string;
  people: PersonRecord[];
  dates: DateResult[];
  rankings: Ranking[];
};

export const pairKey = (a: string, b: string) => [a, b].sort().join("__");
