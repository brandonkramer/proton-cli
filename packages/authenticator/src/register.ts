import type { Command } from "commander";

/** Register `proton auth …` subcommands. Full port lands in PH2. */
export function registerAuthCommands(auth: Command): void {
  auth
    .command("status")
    .description("Show Authenticator session / sync status (port in progress)")
    .option("--json", "Machine-readable JSON")
    .option("--output <format>", "Output format (json|text)", "text")
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals() as { json?: boolean; output?: string };
      const payload = {
        version: 1,
        product: "authenticator",
        ported: false,
        message:
          "Authenticator commands are scaffolding in the monorepo; full port from proton-authenticator-cli is next.",
      };
      if (opts.json || opts.output === "json") {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      console.log(payload.message);
    });

  for (const name of [
    "signin",
    "signout",
    "sync",
    "list",
    "code",
  ] as const) {
    auth
      .command(name)
      .description(`Authenticator ${name} (port in progress — see proton-authenticator-cli)`)
      .allowUnknownOption(true)
      .action(async () => {
        console.error(
          `proton auth ${name}: not ported yet. Use proton-authenticator-cli meanwhile, or continue the monorepo PH2 port.`,
        );
        process.exitCode = 1;
      });
  }
}
