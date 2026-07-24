import type { Command } from "commander";
import { registerGetCommand } from "./commands/get.ts";
import { registerMailCommand } from "./commands/mail.ts";
import { registerSetCommand } from "./commands/set.ts";
import { configureAgentFlags } from "./util/agent.ts";

function outputWantsJson(options: {
  json?: boolean;
  output?: string;
}): boolean {
  return Boolean(options.json) || options.output === "json";
}

/** Register `proton settings …` (and legacy `protonsettings …`) commands. */
export function registerSettingsCommands(settings: Command): void {
  settings
    .option("--json", "Machine-readable JSON (also: PROTONSETTINGS_JSON=1)")
    .option(
      "-o, --output <format>",
      "Output format (json)",
    )
    .option(
      "-y, --yes",
      "Non-interactive confirmations (also implied by --json / CI)",
    );

  settings.hook("preAction", (thisCommand, actionCommand) => {
    const globals = thisCommand.optsWithGlobals() as {
      json?: boolean;
      output?: string;
      yes?: boolean;
    };
    const local = actionCommand.opts() as { dryRun?: boolean };
    configureAgentFlags({
      json: outputWantsJson(globals),
      yes: Boolean(globals.yes),
      dryRun: Boolean(local.dryRun),
    });
  });

  registerGetCommand(settings);
  registerMailCommand(settings);
  registerSetCommand(settings);
}
