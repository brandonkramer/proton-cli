import { authenticateAuthenticator } from "@proton-cli/authenticator";
import {
  dualMintSignIn,
  parseProductList,
  type SignInCredentials,
} from "@proton-cli/core";
import { authenticateVpn } from "@proton-cli/vpn";
import type { Command } from "commander";

async function readCredentials(opts: {
  username?: string;
  password?: string;
  totp?: string;
}): Promise<SignInCredentials> {
  const username =
    opts.username ??
    process.env.PROTON_USERNAME ??
    process.env.PROTONVPN_USERNAME;
  const password =
    opts.password ??
    process.env.PROTON_PASSWORD ??
    process.env.PROTONVPN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Username and password required. Pass --username/--password or set PROTON_USERNAME / PROTON_PASSWORD (pass:// supported later in PH2).",
    );
  }

  return {
    username,
    password,
    totp: opts.totp ?? process.env.PROTON_TOTP ?? process.env.PROTONVPN_TOTP,
  };
}

export function registerSignin(program: Command): void {
  program
    .command("signin")
    .description(
      "Sign in once; mint per-product sessions (vpn + authenticator by default)",
    )
    .option("-u, --username <username>", "Proton username / email")
    .option("-p, --password <password>", "Proton password (prefer env / Pass)")
    .option("--totp <code>", "TOTP code if required")
    .option(
      "--products <list>",
      "Comma list: vpn,auth,all (default: all)",
      "all",
    )
    .option(
      "--partial-ok",
      "Keep successful product sessions if another product fails",
    )
    .option("--json", "Machine-readable JSON")
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals() as {
        username?: string;
        password?: string;
        totp?: string;
        products?: string;
        partialOk?: boolean;
        json?: boolean;
      };
      try {
        const products = parseProductList(opts.products);
        const credentials = await readCredentials(opts);
        const result = await dualMintSignIn({
          credentials,
          products,
          partialOk: Boolean(opts.partialOk),
          authenticators: {
            vpn: authenticateVpn,
            authenticator: authenticateAuthenticator,
          },
        });

        if (opts.json) {
          console.log(JSON.stringify({ version: 1, ...result }, null, 2));
        } else if (result.failed.length && result.succeeded.length === 0) {
          console.error("Sign-in failed:");
          for (const f of result.failed) {
            console.error(`  ${f.product}: ${f.error}`);
          }
          process.exitCode = 1;
        } else {
          console.log(
            `Signed in as ${result.username}: ${result.succeeded.join(", ") || "(none)"}`,
          );
          for (const f of result.failed) {
            console.error(`  failed ${f.product}: ${f.error}`);
          }
          if (result.failed.length) process.exitCode = 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (opts.json) {
          console.log(
            JSON.stringify(
              { version: 1, ok: false, error: message },
              null,
              2,
            ),
          );
        } else {
          console.error(message);
        }
        process.exitCode = 1;
      }
    });
}
