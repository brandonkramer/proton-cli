import {
  clearAccountPassRef,
  loadAccount,
  normalizePassItemRef,
  resolvePassLogin,
  saveAccountPassRef,
} from "@bkramer/proton-core";
import type { Command } from "commander";

export function registerAccount(program: Command): void {
  program
    .command("account [pass-ref]")
    .description(
      "Show or set the default Proton Pass login item for sign-in and unlock",
    )
    .option("--clear", "Clear the saved Pass reference")
    .option(
      "--skip-verify",
      "Do not read the item via pass-cli when saving (skip username check)",
    )
    .option("--json", "Machine-readable JSON")
    .action(async function (this: Command, passRefArg?: string) {
      const opts = this.optsWithGlobals() as {
        clear?: boolean;
        skipVerify?: boolean;
        json?: boolean;
      };

      try {
        if (opts.clear) {
          if (passRefArg) {
            throw new Error("Do not pass a Pass ref with --clear.");
          }
          await clearAccountPassRef();
          if (opts.json) {
            console.log(JSON.stringify({ ok: true, passRef: null }, null, 2));
            return;
          }
          console.log("Cleared saved Proton Pass reference.");
          return;
        }

        if (passRefArg) {
          const passRef = normalizePassItemRef(passRefArg);
          let username: string | undefined;
          if (!opts.skipVerify) {
            const login = await resolvePassLogin(passRef);
            username = login.username;
          }
          const saved = await saveAccountPassRef(passRef);
          if (opts.json) {
            console.log(
              JSON.stringify(
                {
                  ok: true,
                  passRef: saved.passRef,
                  username: username ?? (saved.username || null),
                },
                null,
                2,
              ),
            );
            return;
          }
          console.log(`Saved Pass reference: ${passRef}`);
          if (username) {
            console.log(`Login username: ${username}`);
          }
          console.log(
            "Use `proton signin` (no --pass needed). Keep pass-cli logged in.",
          );
          return;
        }

        const account = await loadAccount();
        const payload = {
          username: account?.username || null,
          products: account?.products ?? [],
          passRef: account?.passRef ?? null,
          accountPathHint: "~/.config/proton-cli/account.json",
        };

        if (opts.json) {
          console.log(JSON.stringify(payload, null, 2));
          return;
        }

        console.log(`Account: ${payload.username ?? "(not signed in)"}`);
        console.log(
          `Pass: ${payload.passRef ?? "(not set — proton account pass://Vault/Item)"}`,
        );
        if (payload.products.length > 0) {
          console.log(`Products: ${payload.products.join(", ")}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exitCode = 1;
      }
    });
}
