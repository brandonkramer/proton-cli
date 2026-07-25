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
  resolveFreshPassTotp,
  resolvePassRef,
  type SignInCredentials,
} from "@bkramer/proton-core";
import { authenticateMail, clearMailState } from "@bkramer/proton-mail";
import { authenticateSettings, clearSettingsState } from "@bkramer/proton-settings";
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
  const passRef = await resolvePassRef(opts.pass);
  if (passRef) {
    const login = await resolvePassLogin(passRef);
    return {
      passRef,
      credentials: {
        username: opts.username ?? login.username,
        password: login.password,
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
        "Use `proton account pass://Vault/Item`, --pass, --username/--password, or PROTON_PASS.",
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
      "Proton Pass login item (pass://Vault/Item). Also: proton account, PROTON_PASS",
    )
    .option(
      "--totp <code>",
      "TOTP for the first product only (codes are single-use; prefer --pass)",
    )
    .option(
      "--products <list>",
      "Comma list: vpn,auth,drive,cal,ctc,settings,set,mail,all (default: all)",
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
          credentials: {
            ...credentials,
            refreshTotp: async (previous?: string) => {
              if (passRef && !(opts.totp ?? process.env.PROTON_TOTP)) {
                return (
                  (await resolveFreshPassTotp(passRef, {
                    avoidCode: previous,
                  })) ?? undefined
                );
              }
              const staticTotp = opts.totp ?? process.env.PROTON_TOTP;
              if (staticTotp && !previous) return staticTotp;
              if (!process.stdin.isTTY || !process.stdout.isTTY) {
                return undefined;
              }
              const rl = createInterface({
                input: process.stdin,
                output: process.stdout,
              });
              try {
                const value = await rl.question(
                  "TOTP to finish sign-in (fresh authenticator code): ",
                );
                return value.trim() || undefined;
              } finally {
                rl.close();
              }
            },
          },
          products,
          partialOk: Boolean(opts.partialOk),
          productGapMs: 8_000,
          rateLimitRetries: 2,
          rateLimitWaitMs: 60_000,
          onProgress: (event) => {
            if (opts.json) return;
            if (event.type === "wait") console.log(event.message);
            if (event.type === "shared") {
              console.log(
                `  ${event.product}: reused ${event.from} session (same API host)`,
              );
            }
          },
          authenticators: {
            vpn: authenticateVpn,
            authenticator: authenticateAuthenticator,
            drive: authenticateDrive,
            calendar: authenticateCalendar,
            contacts: authenticateContacts,
            settings: authenticateSettings,
            mail: authenticateMail,
          },
          clearers: {
            vpn: clearVpnSession,
            authenticator: clearAuthenticatorState,
            drive: clearDriveState,
            calendar: clearCalendarState,
            contacts: clearContactsState,
            settings: clearSettingsState,
            mail: clearMailState,
          },
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
