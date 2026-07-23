import type { LocalEntry } from "../proton/types.ts";

export interface MatchResult {
  entry: LocalEntry;
  score: number;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Simple fuzzy score: exact > prefix > substring on issuer/name. */
export function scoreEntry(entry: LocalEntry, query: string): number {
  const q = normalize(query);
  if (!q) return 0;

  const issuer = normalize(entry.issuer);
  const name = normalize(entry.name);
  const haystack = `${issuer} ${name}`;

  if (issuer === q || name === q) return 100;
  if (issuer.startsWith(q) || name.startsWith(q)) return 80;
  if (haystack.includes(q)) return 60;

  // token match
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => haystack.includes(t))) {
    return 50;
  }

  return 0;
}

export function matchEntries(
  entries: LocalEntry[],
  query: string,
): MatchResult[] {
  const active = entries.filter((e) => e.syncState !== "PendingToDelete");
  if (!query.trim()) {
    return active.map((entry) => ({ entry, score: 1 }));
  }

  return active
    .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ai = `${a.entry.issuer} ${a.entry.name}`;
      const bi = `${b.entry.issuer} ${b.entry.name}`;
      return ai.localeCompare(bi);
    });
}

export function pickBestMatch(
  entries: LocalEntry[],
  query: string,
): LocalEntry | null {
  const matches = matchEntries(entries, query);
  return matches[0]?.entry ?? null;
}
