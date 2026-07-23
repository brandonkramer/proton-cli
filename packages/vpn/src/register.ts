import type { Command } from "commander";
import { registerConnect } from "./commands/connect.ts";
import { registerCountries } from "./commands/countries.tsx";
import { registerDisconnect } from "./commands/disconnect.ts";
import { registerServers } from "./commands/servers.tsx";
import { registerSetup } from "./commands/setup.ts";
import { registerSignin } from "./commands/signin.ts";
import { registerSignout } from "./commands/signout.ts";
import { registerStatus } from "./commands/status.tsx";
import { registerUpdate } from "./commands/update.ts";
import { configureAgentFlags } from "./util/agent.ts";

/** Register `proton vpn …` (and legacy `protonvpn …`) commands. */
export function registerVpnCommands(vpn: Command): void {
  vpn
    .option("--json", "Machine-readable JSON on stdout (also: PROTONVPN_JSON=1)")
    .option(
      "-y, --yes",
      "Non-interactive confirmations (also implied by --json / CI)",
    )
    .option(
      "--sudo",
      "Allow interactive sudo password prompt for WireGuard (macOS)",
    );

  vpn.hook("preAction", (thisCommand) => {
    const globals = thisCommand.optsWithGlobals() as {
      json?: boolean;
      yes?: boolean;
      sudo?: boolean;
    };
    configureAgentFlags({
      json: Boolean(globals.json),
      yes: Boolean(globals.yes),
      interactiveSudo: Boolean(globals.sudo),
    });
  });

  registerSetup(vpn);
  registerUpdate(vpn);
  registerSignin(vpn);
  registerSignout(vpn);
  registerCountries(vpn);
  registerServers(vpn);
  registerConnect(vpn);
  registerDisconnect(vpn);
  registerStatus(vpn);
}
