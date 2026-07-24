import type { Command } from "commander";
import { requireContactsRuntime } from "../context.ts";
import { emitOk, isDryRun, preferNonInteractive } from "../util/agent.ts";
import { CliError, reportCommandError } from "../util/errors.ts";
import { ExitCode } from "../util/exit.ts";

export function registerDelete(contacts: Command): void {
  contacts
    .command("delete")
    .description("Delete a contact by REF")
    .argument("<ref>", "Contact ID or search term")
    .option("-y, --yes", "Skip confirmation")
    .option("--dry-run", "Show target without calling the API")
    .action(async (ref: string, options: { yes?: boolean }) => {
      try {
        const runtime = await requireContactsRuntime();
        const id = await runtime.client.resolveRef(ref);
        if (isDryRun()) {
          emitOk({ dryRun: true, action: "delete", id, ref });
          return;
        }
        if (!options.yes && !preferNonInteractive()) {
          throw new CliError(
            `Deleting contact ${id}. Re-run with -y/--yes to confirm.`,
            ExitCode.USAGE,
          );
        }
        await runtime.client.delete([id]);
        emitOk({ action: "delete", id, deleted: true });
      } catch (error) {
        reportCommandError(error);
      }
    });
}
