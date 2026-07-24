import type { Command } from "commander";
import { configureAgentFlags } from "./util/agent.ts";
import { registerList } from "./commands/list.ts";
import { registerRead } from "./commands/read.ts";
import { registerSearch } from "./commands/search.ts";
import { registerSend } from "./commands/send.ts";
import { registerStatus } from "./commands/status.ts";
import { registerOrganize } from "./commands/organize.ts";
import { registerLabels } from "./commands/labels.ts";
import { registerAddresses } from "./commands/addresses.ts";

/** Register `proton mail …` (and legacy `protonmail …`) commands. */
export function registerMailCommands(mail: Command): void {
  mail
    .option("--json", "Machine-readable JSON (also: PROTONMAIL_JSON=1)")
    .option(
      "-y, --yes",
      "Non-interactive confirmations (also implied by --json / CI)",
    )
    .option("--pass <ref>", "Proton Pass item for account password unlock");

  mail.hook("preAction", (thisCommand, actionCommand) => {
    const globals = thisCommand.optsWithGlobals() as {
      json?: boolean;
      yes?: boolean;
      pass?: string;
    };
    const local = actionCommand.opts() as { dryRun?: boolean };
    configureAgentFlags({
      json: Boolean(globals.json),
      yes: Boolean(globals.yes),
      dryRun: Boolean(local.dryRun),
    });
  });

  registerStatus(mail);
  registerList(mail);
  registerRead(mail);
  registerSearch(mail);
  registerSend(mail);
  registerOrganize(mail);
  registerLabels(mail);
  registerAddresses(mail);
}
