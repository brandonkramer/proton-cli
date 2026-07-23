import type { Command } from "commander";

/** Register `proton vpn …` subcommands. Full port lands in PH2. */
export function registerVpnCommands(vpn: Command): void {
  vpn
    .command("status")
    .description("Show VPN connection / session status (port in progress)")
    .option("--json", "Machine-readable JSON")
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals() as { json?: boolean };
      const payload = {
        version: 1,
        product: "vpn",
        ported: false,
        message:
          "VPN commands are scaffolding in the monorepo; full port from proton-vpn-cli is next.",
      };
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      console.log(payload.message);
    });

  for (const name of [
    "setup",
    "connect",
    "disconnect",
    "countries",
    "servers",
    "signin",
    "signout",
  ] as const) {
    vpn
      .command(name)
      .description(`VPN ${name} (port in progress — see proton-vpn-cli)`)
      .allowUnknownOption(true)
      .action(async () => {
        console.error(
          `proton vpn ${name}: not ported yet. Use proton-vpn-cli meanwhile, or continue the monorepo PH2 port.`,
        );
        process.exitCode = 1;
      });
  }
}
