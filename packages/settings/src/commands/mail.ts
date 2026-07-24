import type { Command } from "commander";
import { getMailSettings, requireSettingsRuntime } from "../settings/client.ts";
import { formatMailSettings } from "../settings/format.ts";
import { wantsJson } from "../util/agent.ts";
import { handleCommandError } from "../util/command.ts";
import { stringifySettingsOutput } from "../util/secrets.ts";

export function registerMailCommand(settings: Command): void {
  settings
    .command("mail")
    .description("Get mail preference settings (text or JSON)")
    .action(async () => {
      try {
        const runtime = await requireSettingsRuntime();
        const data = await getMailSettings(runtime);

        if (wantsJson()) {
          process.stdout.write(`${stringifySettingsOutput(data)}\n`);
          return;
        }

        process.stdout.write(`${formatMailSettings(data)}\n`);
      } catch (error) {
        await handleCommandError(error);
      }
    });
}
