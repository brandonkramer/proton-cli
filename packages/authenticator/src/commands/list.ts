import type { Command } from "commander";
import { loadLocalEntries } from "../config/store.ts";
import {
  filterEntriesByType,
  parseEntryTypeFilter,
} from "../sync/filter.ts";
import { actionList } from "../tui/actions.ts";
import {
  handleCommandError,
  setCommandOutputFormat,
} from "../util/command.ts";
import { CliError } from "../util/errors.ts";
import {
  addOutputOption,
  resolveOutputFormat,
  writeJson,
  writePlain,
} from "../util/output.ts";

export function registerList(program: Command): void {
  addOutputOption(
    program
      .command("list")
      .option(
        "--type <type>",
        "Filter by entry type: totp, steam, or all (default: all)",
        "all",
      )
      .description("List issuers/names from the local cache (no secrets)"),
  ).action(async (options: { type?: string; output?: string }) => {
    try {
      const format = resolveOutputFormat(options.output);
      setCommandOutputFormat(format);

      let type;
      try {
        type = parseEntryTypeFilter(options.type);
      } catch (error) {
        throw new CliError(
          error instanceof Error ? error.message : String(error),
          "invalid_type",
        );
      }

      if (format === "ink") {
        await actionList({ type });
        return;
      }

      const local = await loadLocalEntries();
      const entries = filterEntriesByType(local.entries, type).map((entry) => ({
        entryId: entry.entryId,
        issuer: entry.issuer,
        name: entry.name,
        entryType: entry.entryType,
        period: entry.period,
        syncState: entry.syncState,
      }));

      if (format === "json") {
        writeJson({
          ok: true,
          type,
          count: entries.length,
          entries,
        });
        return;
      }

      if (entries.length === 0) {
        writePlain("(no entries)");
        return;
      }
      writePlain(
        entries.map(
          (e) =>
            `${e.issuer || "—"}\t${e.name || "(unnamed)"}\t${e.entryType}`,
        ),
      );
    } catch (error) {
      await handleCommandError(error);
    }
  });
}
