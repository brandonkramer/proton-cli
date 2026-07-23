import {
  listSavedSessions,
  loadAccount,
  PRODUCTS,
} from "@proton-cli/core";
import type { Command } from "commander";

export function registerStatus(program: Command): void {
  program
    .command("status")
    .description("Show account + per-product session status")
    .option("--json", "Machine-readable JSON")
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals() as { json?: boolean };
      const account = await loadAccount();
      const sessions = await listSavedSessions();
      const byProduct = Object.fromEntries(
        PRODUCTS.map((product) => {
          const saved = sessions.find((s) => s.product === product);
          return [
            product,
            saved
              ? {
                  signedIn: true,
                  username: saved.username,
                  uid: saved.session.UID,
                  expiresAt: saved.expiresAt,
                }
              : { signedIn: false },
          ];
        }),
      );

      const payload = {
        version: 1,
        username: account?.username ?? sessions[0]?.username ?? null,
        products: byProduct,
        note: "Sessions are per API host; tokens are not shared across products.",
      };

      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log(`Account: ${payload.username ?? "(not signed in)"}`);
      for (const product of PRODUCTS) {
        const info = byProduct[product] as {
          signedIn: boolean;
          uid?: string;
          expiresAt?: string;
        };
        if (info.signedIn) {
          console.log(
            `  ${product}: signed in (uid=${info.uid}, expires=${info.expiresAt})`,
          );
        } else {
          console.log(`  ${product}: not signed in`);
        }
      }
    });
}
