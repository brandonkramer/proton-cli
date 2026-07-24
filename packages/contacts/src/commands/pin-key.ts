import type { Command } from "commander";
import { requireContactsRuntime } from "../context.ts";
import { emitOk, isDryRun } from "../util/agent.ts";
import { reportCommandError } from "../util/errors.ts";
import { readArmoredKey } from "../util/key.ts";

export function registerPinKey(contacts: Command): void {
  contacts
    .command("pin-key")
    .description("Pin a public key to a contact")
    .argument("<ref>", "Contact ID or search term")
    .option("--key <path>", "Armored public key file (- for stdin)")
    .option("--email <email>", "Which of the contact's emails to pin the key to")
    .option("--scheme <scheme>", "PGP scheme: pgp-mime or pgp-inline")
    .option("--no-encrypt", "Store the key but leave encryption disabled")
    .option("--dry-run", "Show target without calling the API")
    .action(async (
      ref: string,
      options: {
        key?: string;
        email?: string;
        scheme?: string;
        encrypt?: boolean;
      },
    ) => {
      try {
        if (!options.key) {
          throw new Error("--key is required (armored public key file, or - for stdin)");
        }
        if (
          options.scheme &&
          options.scheme !== "pgp-mime" &&
          options.scheme !== "pgp-inline"
        ) {
          throw new Error(`invalid --scheme "${options.scheme}" (use pgp-mime or pgp-inline)`);
        }
        const armored = await readArmoredKey(options.key);
        const runtime = await requireContactsRuntime();
        const id = await runtime.client.resolveRef(ref);
        const email = await runtime.client.resolveContactEmail(id, options.email);
        if (isDryRun()) {
          emitOk({
            dryRun: true,
            action: "pin-key",
            id,
            ref,
            email,
            scheme: options.scheme ?? "",
          });
          return;
        }
        await runtime.client.pinKey({
          id,
          email,
          armoredKey: armored,
          encrypt: options.encrypt,
          scheme: options.scheme,
        });
        emitOk({ action: "pin-key", id, email, message: `Pinned key for ${email}` });
      } catch (error) {
        reportCommandError(error);
      }
    });
}

export function registerUnpinKey(contacts: Command): void {
  contacts
    .command("unpin-key")
    .description("Remove pinned key(s) from a contact")
    .argument("<ref>", "Contact ID or search term")
    .option("--email <email>", "Which of the contact's emails to unpin")
    .option("--dry-run", "Show target without calling the API")
    .action(async (ref: string, options: { email?: string }) => {
      try {
        const runtime = await requireContactsRuntime();
        const id = await runtime.client.resolveRef(ref);
        const email = await runtime.client.resolveContactEmail(id, options.email);
        if (isDryRun()) {
          emitOk({ dryRun: true, action: "unpin-key", id, ref, email });
          return;
        }
        await runtime.client.unpinKey(id, email);
        emitOk({
          action: "unpin-key",
          id,
          email,
          message: `Removed pinned key(s) for ${email}`,
        });
      } catch (error) {
        reportCommandError(error);
      }
    });
}
