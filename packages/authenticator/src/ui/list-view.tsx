import { Box, Text, useApp, useInput } from "ink";
import { useMemo, useState, type ReactNode } from "react";
import type { LocalEntry } from "../proton/types.ts";
import {
  cycleEntryTypeFilter,
  filterEntriesByType,
  type EntryTypeFilter,
} from "../sync/filter.ts";
import { Brand } from "./brand.tsx";
import { renderUntilExit } from "./render.tsx";

function ListApp({
  entries,
  initialType,
}: {
  entries: LocalEntry[];
  initialType: EntryTypeFilter;
}): ReactNode {
  const { exit } = useApp();
  const [typeFilter, setTypeFilter] = useState<EntryTypeFilter>(initialType);

  const visible = useMemo(
    () => filterEntriesByType(entries, typeFilter),
    [entries, typeFilter],
  );

  useInput((input, key) => {
    if (key.escape || input === "q") {
      exit();
      return;
    }
    // Cycle: all → Totp → Steam → all
    if (input === "f" || input === "t") {
      setTypeFilter((prev) => cycleEntryTypeFilter(prev));
      return;
    }
    if (input === "a" || input === "0") {
      setTypeFilter("all");
      return;
    }
    if (input === "1") {
      setTypeFilter("Totp");
      return;
    }
    if (input === "2") {
      setTypeFilter("Steam");
    }
  });

  const filterLabel =
    typeFilter === "all" ? "all types" : typeFilter.toLowerCase();

  return (
    <Box flexDirection="column">
      <Brand subtitle={`Entries (${visible.length}) · ${filterLabel}`} />
      {visible.length === 0 ? (
        <Text dimColor>
          No entries
          {typeFilter === "all"
            ? ". Run `protonauth sync` after sign-in."
            : ` matching type ${typeFilter}.`}
        </Text>
      ) : (
        <Box flexDirection="column">
          {visible.map((entry) => (
            <Box key={entry.entryId || entry.localId} gap={1}>
              <Text color="cyan">{entry.issuer || "—"}</Text>
              <Text>{entry.name || "(unnamed)"}</Text>
              <Text dimColor>
                {entry.entryType}
                {entry.syncState !== "Synced" ? ` · ${entry.syncState}` : ""}
              </Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          f/t cycle type · 1 Totp · 2 Steam · a all · q / Esc close
        </Text>
      </Box>
    </Box>
  );
}

export async function showEntryList(
  entries: LocalEntry[],
  options: { type?: EntryTypeFilter } = {},
): Promise<void> {
  await renderUntilExit(
    <ListApp entries={entries} initialType={options.type ?? "all"} />,
  );
}
