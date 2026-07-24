import type { Command } from "commander";
import { requireContactsRuntime } from "../context.ts";
import { emitOk } from "../util/agent.ts";
import { reportCommandError } from "../util/errors.ts";

export function registerGet(contacts: Command): void {
  contacts
    .command("get")
    .description("Get a contact by REF")
    .argument("<ref>", "Contact ID or search term")
    .action(async (ref: string) => {
      try {
        const runtime = await requireContactsRuntime();
        const id = await runtime.client.resolveRef(ref);
        const contact = await runtime.client.get(id);
        emitOk({ action: "get", contact });
      } catch (error) {
        reportCommandError(error);
      }
    });
}
