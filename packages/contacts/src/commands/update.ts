import type { Command } from "commander";
import { requireContactsRuntime } from "../context.ts";
import type { NewContactInput } from "../proton/client.ts";
import { emitOk, isDryRun } from "../util/agent.ts";
import { reportCommandError } from "../util/errors.ts";

function collectMany(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function registerUpdate(contacts: Command): void {
  contacts
    .command("update")
    .description("Update a contact by REF")
    .argument("<ref>", "Contact ID or search term")
    .option("--name <name>", "Contact display name")
    .option("--email <email>", "Replace emails (repeatable)", collectMany, [])
    .option("--phone <phone>", "Replace phones (repeatable)", collectMany, [])
    .option("--title <title>", "Job title")
    .option("--org <org>", "Organization")
    .option("--note <note>", "Notes")
    .option("--birthday <date>", "Birthday (YYYY-MM-DD)")
    .option("--address <address>", "Postal address")
    .option("--url <url>", "Website URL")
    .option("--dry-run", "Show payload without calling the API")
    .action(async (
      ref: string,
      options: {
        name?: string;
        email: string[];
        phone: string[];
        title?: string;
        org?: string;
        note?: string;
        birthday?: string;
        address?: string;
        url?: string;
      },
    ) => {
      try {
        const runtime = await requireContactsRuntime();
        const id = await runtime.client.resolveRef(ref);
        const input: NewContactInput = {
          name: options.name ?? "",
          emails: options.email,
          phones: options.phone,
          title: options.title ?? "",
          org: options.org ?? "",
          note: options.note ?? "",
          birthday: options.birthday ?? "",
          address: options.address ?? "",
          url: options.url ?? "",
        };
        if (isDryRun()) {
          const existing = await runtime.client.get(id);
          emitOk({
            dryRun: true,
            action: "update",
            id,
            patch: input,
            existing,
          });
          return;
        }
        const contact = await runtime.client.update(id, input);
        emitOk({ action: "update", contact });
      } catch (error) {
        reportCommandError(error);
      }
    });
}
