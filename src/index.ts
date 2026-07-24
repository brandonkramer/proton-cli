#!/usr/bin/env bun
import { registerAuthCommands } from "@bkramer/proton-authenticator";
import { registerVpnCommands } from "@bkramer/proton-vpn";
import { Command } from "commander";
import { registerSignin } from "./commands/signin.ts";
import { registerSignout } from "./commands/signout.ts";
import { registerStatus } from "./commands/status.ts";
import { registerUpdate } from "./commands/update.ts";
import { launchParentTui } from "./tui/launch.ts";

const pkg = (await Bun.file(
  new URL("../package.json", import.meta.url),
).json()) as { version: string };

const argv = process.argv.slice(2);
if (argv.length === 0) {
  const isTty =
    Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
  const agent =
    process.env.CI === "1" ||
    process.env.CI === "true" ||
    process.env.PROTON_AGENT === "1" ||
    process.env.PROTONVPN_AGENT === "1" ||
    process.env.PROTONAUTH_AGENT === "1" ||
    process.env.PROTONVPN_JSON === "1";
  if (!isTty || agent) {
    console.error(
      "proton: no command given.\n" +
        "Examples: proton status --json | proton vpn connect --country US | proton auth code github\n" +
        "Sign in once: proton signin --pass pass://Vault/Item",
    );
    process.exit(2);
  }
  await launchParentTui();
  process.exit(0);
}
const program = new Command();

program
  .name("proton")
  .description(
    "Unofficial unified Proton CLI (VPN + Authenticator).\n" +
      "Not affiliated with Proton AG.\n" +
      "Shared sign-in mints per-product sessions (vpn-api vs authenticator-api).",
  )
  .version(pkg.version)
  .option("--json", "Prefer machine-readable JSON where supported")
  .option("-y, --yes", "Non-interactive confirmations")
  .option("--sudo", "Allow interactive sudo for WireGuard (macOS)");

registerSignin(program);
registerSignout(program);
registerStatus(program);
registerUpdate(program);

const vpn = program
  .command("vpn")
  .description("Proton VPN commands (WireGuard)");
registerVpnCommands(vpn);

const auth = program
  .command("auth")
  .description("Proton Authenticator commands (TOTP sync)");
registerAuthCommands(auth);

await program.parseAsync(process.argv);
