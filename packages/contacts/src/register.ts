import type { Command } from "commander";
import { configureAgentFlags } from "./util/agent.ts";
import { registerCreate } from "./commands/create.ts";
import { registerDelete } from "./commands/delete.ts";
import { registerGet } from "./commands/get.ts";
import { registerGroups } from "./commands/groups.ts";
import { registerList } from "./commands/list.ts";
import { registerPinKey, registerUnpinKey } from "./commands/pin-key.ts";
import { registerUpdate } from "./commands/update.ts";

/** Register `proton contacts …` (and legacy `protoncontacts …`) commands. */
export function registerContactsCommands(contacts: Command): void {
  contacts
    .option("--json", "Machine-readable JSON (also: PROTONCONTACTS_JSON=1)")
    .option(
      "-y, --yes",
      "Non-interactive confirmations (also implied by --json / CI)",
    )
    .option("--pass <ref>", "Proton Pass item for account password unlock");

  contacts.hook("preAction", (thisCommand, actionCommand) => {
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

  registerList(contacts);
  registerGet(contacts);
  registerCreate(contacts);
  registerUpdate(contacts);
  registerDelete(contacts);
  registerPinKey(contacts);
  registerUnpinKey(contacts);
  registerGroups(contacts);
}
