import type { Command } from "commander";
import { loadLocalEntries } from "../config/store.ts";
import { PASS_ENV } from "../pass/credentials.ts";
import { pickBestMatch } from "../sync/match.ts";
import { decryptLocalEntry, unlockWithPassword } from "../sync/sync.ts";
import { actionCode } from "../tui/actions.ts";
import { preferNonInteractive } from "../util/agent.ts";
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
import { resolveAccountPassword } from "../util/password.ts";
import { generateCode } from "../wasm/service.ts";

export function registerCode(program: Command): void {
  addOutputOption(
    program
      .command("code")
      .argument("[query]", "Fuzzy match against issuer or name")
      .option(
        "--pass <ref>",
        `Proton Pass login item for account password. Also: $${PASS_ENV}`,
      )
      .description(
        "Show current (and next) TOTP/Steam code for a matching entry",
      ),
  ).action(async (query?: string, options?: { pass?: string; output?: string }) => {
    try {
      const format = resolveOutputFormat(options?.output);
      setCommandOutputFormat(format);

      const local = await loadLocalEntries();
      if (local.entries.length === 0) {
        throw new CliError(
          'No local entries. Run "proton auth sync" first.',
          "no_entries",
        );
      }

      const q = query?.trim();
      if (!q) {
        if (format !== "ink" || preferNonInteractive()) {
          throw new CliError(
            "Query required in non-interactive mode.\n" +
              "Usage: proton auth code <issuer-or-name> --output json",
            "query_required",
          );
        }
        await actionCode();
        return;
      }

      const match = pickBestMatch(local.entries, q);
      if (!match) {
        throw new CliError(`No entry matched "${q}".`, "not_found");
      }

      const password = await resolveAccountPassword({
        passRef: options?.pass,
        promptHint:
          "Password unlocks the Authenticator Key to generate a code.",
      });

      const ctx = await unlockWithPassword(password);
      const model = await decryptLocalEntry(match, ctx.encryptionKeys);
      const period = model.period || 30;
      const now = Math.floor(Date.now() / 1000);
      const remaining = period - (now % period);
      const codes = await generateCode(model, now);
      const label = `${match.issuer || "—"} · ${match.name || "(unnamed)"}`;

      if (format === "json") {
        writeJson({
          ok: true,
          issuer: match.issuer,
          name: match.name,
          entryType: match.entryType,
          current: codes.current_code,
          next: codes.next_code,
          period,
          remaining,
        });
        return;
      }

      if (format === "plain") {
        writePlain([
          label,
          `current\t${codes.current_code}`,
          `next\t${codes.next_code}`,
          `remaining\t${remaining}`,
          `period\t${period}`,
        ]);
        return;
      }

      const { showCodeView } = await import("../ui/code-view.tsx");
      await showCodeView({ model, label });
    } catch (error) {
      await handleCommandError(error);
    }
  });
}
