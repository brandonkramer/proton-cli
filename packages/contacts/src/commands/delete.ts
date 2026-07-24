import type { Command } from "commander";
import { requireContactsRuntime } from "../context.ts";
import { emitOk, isDryRun } from "../util/agent.ts";
import { reportCommandError } from "../util/errors.ts";

export function registerDelete(contacts: Command): void {
  contacts
    .command("delete")
    .description("Delete a contact by REF")
    .argument("<ref>", "Contact ID or search term")
    .option("--dry-run", "Show target without calling the API")
    .action(async (ref: string) => {
      try {
        const runtime = await requireContactsRuntime();
        const id = await runtime.client.resolveRef(ref);
        if (isDryRun()) {
          emitOk({ dryRun: true, action: "delete", id, ref });
          return;
        }
        await runtime.client.delete([id]);
        emitOk({ action: "delete", id, deleted: true });
      } catch (error) {
        reportCommandError(error);
      }
    });
}
