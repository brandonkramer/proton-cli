import type { EntryType, LocalEntry } from "../proton/types.ts";

export type EntryTypeFilter = "all" | EntryType;

const TYPE_ALIASES: Record<string, EntryTypeFilter> = {
  all: "all",
  "*": "all",
  totp: "Totp",
  t: "Totp",
  steam: "Steam",
  s: "Steam",
};

export function parseEntryTypeFilter(raw?: string): EntryTypeFilter {
  if (!raw?.trim()) return "all";
  const key = raw.trim().toLowerCase();
  const parsed = TYPE_ALIASES[key];
  if (!parsed) {
    throw new Error(
      `Unknown entry type "${raw}". Use totp, steam, or all.`,
    );
  }
  return parsed;
}

export function filterEntriesByType(
  entries: LocalEntry[],
  type: EntryTypeFilter,
): LocalEntry[] {
  const active = entries.filter((e) => e.syncState !== "PendingToDelete");
  if (type === "all") return active;
  return active.filter((e) => e.entryType === type);
}

export function cycleEntryTypeFilter(
  current: EntryTypeFilter,
): EntryTypeFilter {
  if (current === "all") return "Totp";
  if (current === "Totp") return "Steam";
  return "all";
}
