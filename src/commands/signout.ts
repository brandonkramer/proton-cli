import { clearAllSessions } from "@proton-cli/core";
import type { Command } from "commander";

export function registerSignout(program: Command): void {
  program
    .command("signout")
    .description("Clear all product sessions under ~/.config/proton-cli")
    .option("--json", "Machine-readable JSON")
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals() as { json?: boolean };
      await clearAllSessions();
      if (opts.json) {
        console.log(JSON.stringify({ version: 1, ok: true, cleared: true }));
        return;
      }
      console.log("Signed out (all product sessions cleared).");
    });
}
