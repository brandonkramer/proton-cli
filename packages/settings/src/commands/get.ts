import type { Command } from "commander";
import { getAccountSettings, requireSettingsRuntime } from "../settings/client.ts";
import { formatAccountSettings } from "../settings/format.ts";
import { wantsJson } from "../util/agent.ts";
import { handleCommandError } from "../util/command.ts";
import { stringifySettingsOutput } from "../util/secrets.ts";

export function registerGetCommand(settings: Command): void {
  settings
    .command("get")
    .description("Get account settings (text or JSON)")
    .action(async () => {
      try {
        const runtime = await requireSettingsRuntime();
        const data = await getAccountSettings(runtime);

        if (wantsJson()) {
          process.stdout.write(`${stringifySettingsOutput(data)}\n`);
          return;
        }

        process.stdout.write(`${formatAccountSettings(data)}\n`);
      } catch (error) {
        await handleCommandError(error);
      }
    });
}
