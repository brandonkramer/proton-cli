import type { Command } from "commander";
import { PASS_ENV } from "../pass/credentials.ts";
import { formatSyncSummary, syncEntries } from "../sync/sync.ts";
import { actionSync } from "../tui/actions.ts";
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
import { resolveAccountPassword } from "../util/password.ts";

export function registerSync(program: Command): void {
  addOutputOption(
    program
      .command("sync")
      .option(
        "--pass <ref>",
        `Proton Pass login item for account password. Also: $${PASS_ENV}`,
      )
      .description("Pull remote Authenticator entries and update local cache"),
  ).action(async (options?: { pass?: string; output?: string }) => {
    try {
      const format = resolveOutputFormat(options?.output);
      setCommandOutputFormat(format);

      if (format === "ink") {
        if (options?.pass) {
          process.env.PROTONAUTH_PASS = options.pass;
        }
        await actionSync();
        return;
      }

      const password = await resolveAccountPassword({
        passRef: options?.pass,
      });
      const result = await syncEntries(password);

      if (format === "json") {
        writeJson({
          ok: true,
          pulled: result.pulled,
          remoteTotal: result.remoteTotal,
          skipped: result.skipped,
          deletedRemote: result.deletedRemote,
          lastSyncAt: result.store.lastSyncAt,
          summary: formatSyncSummary(result),
        });
        return;
      }

      writePlain(formatSyncSummary(result));
    } catch (error) {
      await handleCommandError(error);
    }
  });
}
