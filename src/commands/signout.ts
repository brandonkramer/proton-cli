import { signOutAuthenticator } from "@proton-cli/authenticator";
import { clearAllSessions } from "@proton-cli/core";
import { signOutVpn } from "@proton-cli/vpn";
import type { Command } from "commander";

export function registerSignout(program: Command): void {
  program
    .command("signout")
    .description("Clear all product sessions and local auth state")
    .option("--json", "Machine-readable JSON")
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals() as { json?: boolean };
      await signOutVpn();
      await signOutAuthenticator();
      await clearAllSessions();
      if (opts.json) {
        console.log(JSON.stringify({ version: 1, ok: true, cleared: true }));
        return;
      }
      console.log("Signed out (vpn + authenticator sessions cleared).");
    });
}
