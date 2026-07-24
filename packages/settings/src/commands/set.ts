import type { Command } from "commander";
import {
  listWritableMailKeys,
  MAIL_SETTING_SPECS,
  requireSettingsRuntime,
  updateMailSetting,
} from "../settings/client.ts";
import { formatWritableKeysList } from "../settings/format.ts";
import { emitOk, emitPlain, isDryRun, wantsJson } from "../util/agent.ts";
import { handleCommandError } from "../util/command.ts";

export function registerSetCommand(settings: Command): void {
  settings
    .command("set")
    .description("List or update mail settings")
    .argument("[key]", "Setting key")
    .argument("[value]", "Setting value")
    .option("--dry-run", "Show what would change without calling the API")
    .action(async (key: string | undefined, value: string | undefined) => {
      try {
        if (!key) {
          const keys = listWritableMailKeys().map((name) => ({
            key: name,
            description: MAIL_SETTING_SPECS[name]?.description,
          }));

          if (wantsJson()) {
            emitOk({ action: "list", keys });
            return;
          }

          emitPlain(formatWritableKeysList());
          return;
        }

        if (value === undefined) {
          throw new Error(`missing value for setting ${JSON.stringify(key)}`);
        }

        if (isDryRun()) {
          if (wantsJson()) {
            emitOk({ action: "set", dryRun: true, key, value });
          } else {
            emitPlain(`dry-run: would set ${key} = ${value}`);
          }
          return;
        }

        const runtime = await requireSettingsRuntime();
        const result = await updateMailSetting(runtime, key, value);

        if (wantsJson()) {
          emitOk({ action: "set", ...result });
          return;
        }

        emitOk({ message: `Set ${key} = ${value}` });
      } catch (error) {
        await handleCommandError(error);
      }
    });
}
