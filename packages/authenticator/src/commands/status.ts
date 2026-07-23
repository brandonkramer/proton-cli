import type { Command } from "commander";
import { configDir } from "../config/paths.ts";
import { loadLocalEntries } from "../config/store.ts";
import { tryExistingSession } from "../proton/auth.ts";
import { actionStatus } from "../tui/actions.ts";
import {
  handleCommandError,
  setCommandOutputFormat,
} from "../util/command.ts";
import {
  addOutputOption,
  resolveOutputFormat,
  writeJson,
  writePlain,
} from "../util/output.ts";

export function registerStatus(program: Command): void {
  addOutputOption(
    program
      .command("status")
      .description("Show session, key, entry count, and last sync"),
  ).action(async (options: { output?: string }) => {
    try {
      const format = resolveOutputFormat(options.output);
      setCommandOutputFormat(format);

      if (format === "ink") {
        await actionStatus();
        return;
      }

      const session = await tryExistingSession();
      const local = await loadLocalEntries();
      const entryCount = local.entries.filter(
        (e) => e.syncState !== "PendingToDelete",
      ).length;
      const payload = {
        signedIn: Boolean(session),
        username: session?.username ?? null,
        entryCount,
        lastSyncAt: local.lastSyncAt,
        hasAuthenticatorKey: Boolean(local.authenticatorKeyId),
        configDir: configDir(),
      };

      if (format === "json") {
        writeJson({ ok: true, ...payload });
        return;
      }

      writePlain([
        `signedIn\t${payload.signedIn}`,
        `username\t${payload.username ?? ""}`,
        `entryCount\t${payload.entryCount}`,
        `lastSyncAt\t${payload.lastSyncAt ?? ""}`,
        `hasAuthenticatorKey\t${payload.hasAuthenticatorKey}`,
        `configDir\t${payload.configDir}`,
      ]);
    } catch (error) {
      await handleCommandError(error);
    }
  });
}
