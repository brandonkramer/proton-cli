#!/usr/bin/env bun
import { registerAuthCommands } from "@proton-cli/authenticator";
import { registerVpnCommands } from "@proton-cli/vpn";
import { Command } from "commander";
import { registerSignin } from "./commands/signin.ts";
import { registerSignout } from "./commands/signout.ts";
import { registerStatus } from "./commands/status.ts";

const pkg = (await Bun.file(
  new URL("../package.json", import.meta.url),
).json()) as { version: string };

const program = new Command();

program
  .name("proton")
  .description(
    "Unofficial unified Proton CLI (VPN + Authenticator).\n" +
      "Not affiliated with Proton AG.\n" +
      "Shared sign-in mints per-product sessions (vpn-api vs authenticator-api).",
  )
  .version(pkg.version)
  .option("--json", "Prefer machine-readable JSON where supported");

registerSignin(program);
registerSignout(program);
registerStatus(program);

const vpn = program
  .command("vpn")
  .description("Proton VPN commands (WireGuard)");
registerVpnCommands(vpn);

const auth = program
  .command("auth")
  .description("Proton Authenticator commands (TOTP sync)");
registerAuthCommands(auth);

await program.parseAsync(process.argv);
