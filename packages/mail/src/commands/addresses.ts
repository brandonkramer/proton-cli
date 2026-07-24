import type { Command } from "commander";
import { requireMailRuntime } from "../context.ts";
import { listAccountAddresses } from "../service/addresses.ts";
import { emitOk, isDryRun, wantsJson } from "../util/agent.ts";
import { reportCommandError } from "../util/errors.ts";

export async function runAddressesList(options: { passRef?: string }): Promise<void> {
  if (isDryRun()) {
    emitOk({ dryRun: true, action: "addresses-list" });
    return;
  }

  const runtime = await requireMailRuntime({ passRef: options.passRef });
  const addresses = await listAccountAddresses({ session: runtime.session });

  if (wantsJson()) {
    emitOk({ action: "addresses-list", addresses, total: addresses.length });
    return;
  }

  if (addresses.length === 0) {
    process.stdout.write("No addresses.\n");
    return;
  }

  for (const address of addresses) {
    process.stdout.write(`${address.id}\t${address.email}\t${address.keyCount} key(s)\n`);
  }
}

export function registerAddresses(mail: Command): void {
  mail
    .command("addresses")
    .description("List account mail addresses")
    .option("--dry-run", "Print planned action without calling the API")
    .action(async function (this: Command) {
      try {
        const globals = this.parent?.optsWithGlobals() as { pass?: string } | undefined;
        await runAddressesList({ passRef: globals?.pass });
      } catch (error) {
        reportCommandError(error);
      }
    });
}
