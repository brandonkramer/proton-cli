import type { Command } from "commander";
import { requireContactsRuntime } from "../context.ts";
import { emitOk } from "../util/agent.ts";
import { reportCommandError } from "../util/errors.ts";

export function registerList(contacts: Command): void {
  contacts
    .command("list")
    .description("List contacts")
    .action(async () => {
      try {
        const runtime = await requireContactsRuntime();
        const items = await runtime.client.listAll();
        emitOk({ action: "list", contacts: items, total: items.length });
      } catch (error) {
        reportCommandError(error);
      }
    });
}
