import type { Command } from "commander";
import { requireContactsRuntime } from "../context.ts";
import { cardPayload } from "../proton/client.ts";
import type { NewContactInput } from "../proton/client.ts";
import { emitOk, isDryRun } from "../util/agent.ts";
import { reportCommandError } from "../util/errors.ts";

function collectMany(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function registerCreate(contacts: Command): void {
  contacts
    .command("create")
    .description("Create a contact")
    .option("--name <name>", "Contact display name")
    .option("--email <email>", "Email address (repeatable)", collectMany, [])
    .option("--phone <phone>", "Phone number (repeatable)", collectMany, [])
    .option("--title <title>", "Job title")
    .option("--org <org>", "Organization")
    .option("--note <note>", "Notes")
    .option("--birthday <date>", "Birthday (YYYY-MM-DD)")
    .option("--address <address>", "Postal address")
    .option("--url <url>", "Website URL")
    .option("--dry-run", "Show payload without calling the API")
    .action(async (options: {
      name: string;
      email: string[];
      phone: string[];
      title?: string;
      org?: string;
      note?: string;
      birthday?: string;
      address?: string;
      url?: string;
    }) => {
      try {
        const input: NewContactInput = {
          name: options.name,
          emails: options.email,
          phones: options.phone,
          title: options.title ?? "",
          org: options.org ?? "",
          note: options.note ?? "",
          birthday: options.birthday ?? "",
          address: options.address ?? "",
          url: options.url ?? "",
        };
        const runtime = await requireContactsRuntime();
        const cards = await runtime.client.buildCards(input);
        if (isDryRun()) {
          emitOk({
            dryRun: true,
            action: "create",
            contact: input,
            cards: cardPayload(cards),
          });
          return;
        }
        const id = await runtime.client.create(input);
        emitOk({ action: "create", id, contact: { ...input, id } });
      } catch (error) {
        reportCommandError(error);
      }
    });
}
