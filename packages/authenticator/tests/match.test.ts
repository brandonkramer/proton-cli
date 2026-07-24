import { describe, expect, test } from "bun:test";
import type { LocalEntry } from "../src/proton/types.ts";
import {
  matchEntries,
  pickBestMatch,
  resolveEntryMatch,
  scoreEntry,
} from "../src/sync/match.ts";

function entry(partial: Partial<LocalEntry> & Pick<LocalEntry, "issuer" | "name">): LocalEntry {
  return {
    entryId: partial.entryId ?? "e1",
    localId: partial.localId ?? "l1",
    authenticatorKeyId: "k1",
    revision: 1,
    contentFormatVersion: 1,
    content: "YQ==",
    flags: 0,
    createTime: 0,
    modifyTime: 0,
    period: 30,
    entryType: "Totp",
    syncState: "Synced",
    ...partial,
  };
}

describe("matchEntries", () => {
  const entries = [
    entry({ issuer: "GitHub", name: "work" }),
    entry({ entryId: "e2", localId: "l2", issuer: "Google", name: "personal" }),
    entry({
      entryId: "e3",
      localId: "l3",
      issuer: "Steam",
      name: "main",
      entryType: "Steam",
    }),
  ];

  test("exact issuer wins", () => {
    expect(pickBestMatch(entries, "GitHub")?.issuer).toBe("GitHub");
    expect(scoreEntry(entries[0]!, "github")).toBeGreaterThan(50);
  });

  test("substring on name", () => {
    expect(pickBestMatch(entries, "person")?.name).toBe("personal");
  });

  test("empty query returns all active", () => {
    expect(matchEntries(entries, "").length).toBe(3);
  });

  test("resolveEntryMatch rejects ambiguous ties when requireUnique", () => {
    const tied = [
      entry({ entryId: "e1", issuer: "GitHub", name: "work" }),
      entry({ entryId: "e2", issuer: "GitHub", name: "personal" }),
    ];
    const result = resolveEntryMatch(tied, "github", { requireUnique: true });
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
    }
  });

  test("resolveEntryMatch accepts exact entry ID", () => {
    const tied = [
      entry({ entryId: "e1", issuer: "GitHub", name: "work" }),
      entry({ entryId: "e2", issuer: "GitHub", name: "personal" }),
    ];
    const result = resolveEntryMatch(tied, "e2", { requireUnique: true });
    expect(result.kind).toBe("match");
    if (result.kind === "match") {
      expect(result.entry.entryId).toBe("e2");
    }
  });
});
