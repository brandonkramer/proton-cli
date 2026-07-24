import {
  authenticateAuthenticator,
  clearAuthenticatorState,
} from "@bkramer/proton-authenticator";
import { authenticateCalendar, clearCalendarState } from "@bkramer/proton-calendar";
import { authenticateContacts, clearContactsState } from "@bkramer/proton-contacts";
import {
  dualMintSignIn,
  parseProductList,
  resolvePassLogin,
  resolvePassRefFromEnv,
  resolvePassTotp,
  type ProductId,
  type SignInCredentials,
} from "@bkramer/proton-core";
import { authenticateDrive, clearDriveState } from "@bkramer/proton-drive";
import { authenticateVpn, clearVpnSession } from "@bkramer/proton-vpn";
import type { Command } from "commander";
import { createInterface } from "node:readline/promises";

async function readCredentials(opts: {
  username?: string;
  password?: string;
  totp?: string;
  pass?: string;
}): Promise<{ credentials: SignInCredentials; passRef?: string }> {
  const passRef = resolvePassRefFromEnv(opts.pass);
  if (passRef) {
    const login = await resolvePassLogin(passRef);
    return {
      passRef,
      credentials: {
        username: opts.username ?? login.username,
        password: login.password,
        // Prefer fresh Pass TOTP per product via prepareCredentials.
        totp: opts.totp ?? process.env.PROTON_TOTP ?? undefined,
      },
    };
  }

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
      "Username and password required.\n" +
        "Use --pass pass://Vault/Item, --username/--password, or set PROTON_USERNAME / PROTON_PASSWORD / PROTON_PASS.",
    );
  }

  return {
    credentials: {
      username,
      password,
      totp: opts.totp ?? process.env.PROTON_TOTP ?? process.env.PROTONVPN_TOTP,
    },
  };
}

function productLabel(product: ProductId): string {
  switch (product) {
    case "vpn":
      return "VPN";
    case "authenticator":
      return "Authenticator";
    case "drive":
      return "Drive";
    case "calendar":
      return "Calendar";
    case "contacts":
      return "Contacts";
  }
}

async function promptTotp(product: ProductId): Promise<string | undefined> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return undefined;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const label = productLabel(product);
    const value = await rl.question(
      `TOTP for ${label} (fresh code; Enter to skip): `,
    );
    return value.trim() || undefined;
  } finally {
    rl.close();
  }
}

function makePrepareCredentials(options: {
  passRef?: string;
  products: ProductId[];
  staticTotp?: string;
}): (
  product: ProductId,
  credentials: SignInCredentials,
) => Promise<SignInCredentials> {
  let index = 0;
  return async (product, base) => {
    const isFirst = index === 0;
    index += 1;

    if (options.passRef && !options.staticTotp) {
      const totp = (await resolvePassTotp(options.passRef)) ?? undefined;
      return { ...base, totp };
    }

    // Single --totp / env code only works for the first product (codes are single-use).
    if (isFirst && (options.staticTotp || base.totp)) {
      return { ...base, totp: options.staticTotp ?? base.totp };
    }

    if (options.products.length > 1) {
      const totp = await promptTotp(product);
      if (totp) return { ...base, totp };
      if (!isFirst && (options.staticTotp || base.totp)) {
        throw new Error(
          `TOTP codes are single-use per API host. Provide a fresh code for ${product} ` +
            `(interactive prompt), or use --pass so Pass can supply a new TOTP.`,
        );
      }
    }

    return base;
  };
}

export function registerSignin(program: Command): void {
  program
    .command("signin")
    .description(
      "Sign in once; mint per-product sessions (all products by default)",
    )
    .option("-u, --username <username>", "Proton username / email")
    .option("-p, --password <password>", "Proton password (prefer env / Pass)")
    .option(
      "--pass <ref>",
      "Proton Pass login item (pass://Vault/Item). Also: PROTON_PASS / PROTONVPN_PASS / PROTONAUTH_PASS",
    )
    .option(
      "--totp <code>",
      "TOTP for the first product only (codes are single-use; prefer --pass)",
    )
    .option(
      "--products <list>",
      "Comma list: vpn,auth,drive,cal,ctc,all (default: all)",
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
        pass?: string;
        products?: string;
        partialOk?: boolean;
        json?: boolean;
      };
      try {
        const products = parseProductList(opts.products);
        const { credentials, passRef } = await readCredentials(opts);
        const result = await dualMintSignIn({
          credentials,
          products,
          partialOk: Boolean(opts.partialOk),
          authenticators: {
            vpn: authenticateVpn,
            authenticator: authenticateAuthenticator,
            drive: authenticateDrive,
            calendar: authenticateCalendar,
            contacts: authenticateContacts,
          },
          clearers: {
            vpn: clearVpnSession,
            authenticator: clearAuthenticatorState,
            drive: clearDriveState,
            calendar: clearCalendarState,
            contacts: clearContactsState,
          },
          prepareCredentials: makePrepareCredentials({
            passRef,
            products,
            staticTotp: opts.totp ?? process.env.PROTON_TOTP,
          }),
        });

        if (opts.json) {
          console.log(
            JSON.stringify(
              { version: 1, ok: result.failed.length === 0, ...result },
              null,
              2,
            ),
          );
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
