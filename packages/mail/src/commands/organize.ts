import type { Command } from "commander";
import {
  organizeMessage,
  organizeMessages,
  type OrganizeAction,
  type OrganizeBatchResult,
  type OrganizeItemResult,
} from "../imap/organize.ts";
import { withImapSession } from "../imap/client.ts";
import {
  handleCommandError,
  setCommandOutputFormat,
} from "../util/command.ts";
import { CliError } from "../util/errors.ts";
import { MailExitCode } from "../util/exit.ts";
import { parseMessageRef } from "../util/uid.ts";
import {
  addOutputOption,
  resolveOutputFormat,
  writeJson,
  writePlain,
} from "../util/output.ts";
import { assertDestructiveAllowed, assertMutationAllowed } from "../util/safety.ts";

interface CommonOrganizeOptions {
  output?: string;
  json?: boolean;
  dryRun?: boolean;
  yes?: boolean;
}

interface MoveOptions extends CommonOrganizeOptions {
  to?: string;
}

interface RestoreOptions extends CommonOrganizeOptions {
  to?: string;
}

interface BatchOptions extends CommonOrganizeOptions {
  ids?: string;
  to?: string;
}

function resolveFormat(options: CommonOrganizeOptions) {
  return resolveOutputFormat(options.output ?? (options.json ? "json" : undefined));
}

function addJsonOption(command: Command): Command {
  return command.option("--json", "Shorthand for --output json");
}

function addDryRunOption(command: Command): Command {
  return command.option(
    "--dry-run",
    "Print intended organize actions without mutating mailboxes",
  );
}

function parseRefList(input: string): ReturnType<typeof parseMessageRef>[] {
  const parts = input
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new CliError(
      "At least one message reference is required.",
      "missing_message_refs",
      MailExitCode.USER,
    );
  }
  return parts.map((part) => parseMessageRef(part));
}

function writeOrganizeResult(
  result: OrganizeItemResult,
  format: ReturnType<typeof resolveOutputFormat>,
): void {
  if (format === "json") {
    writeJson({ ok: true, ...result });
    return;
  }

  const lines = [
    result.dryRun ? "dry-run\ttrue" : "ok\ttrue",
    `action\t${result.action}`,
    `ref\t${result.ref}`,
    ...(result.destination ? [`destination\t${result.destination}`] : []),
    ...(result.flags ? [`flags\t${result.flags.join(" ")}`] : []),
  ];
  writePlain(lines);
}

function writeBatchResult(
  result: OrganizeBatchResult,
  format: ReturnType<typeof resolveOutputFormat>,
): void {
  if (format === "json") {
    writeJson({
      ok: true,
      action: result.action,
      dryRun: result.dryRun,
      count: result.results.length,
      results: result.results,
    });
    return;
  }

  writePlain([
    result.dryRun ? "dry-run\ttrue" : "ok\ttrue",
    `action\t${result.action}`,
    `count\t${result.results.length}`,
    ...result.results.map((item) =>
      [
        item.ref,
        item.destination ?? "",
        item.flags?.join(" ") ?? "",
      ].join("\t"),
    ),
  ]);
}

async function runSingleOrganize(
  refArg: string,
  action: OrganizeAction,
  options: CommonOrganizeOptions & { to?: string },
): Promise<void> {
  const format = resolveFormat(options);
  setCommandOutputFormat(format);
  const ref = parseMessageRef(refArg);

  if (!options.dryRun) {
    if (action === "delete") {
      assertDestructiveAllowed({ yes: options.yes });
    } else {
      assertMutationAllowed();
    }
  }

  const result = await withImapSession((client) =>
    organizeMessage(client, ref, action, {
      dryRun: options.dryRun,
      destination: options.to,
    }),
  );

  writeOrganizeResult(result, format);
}

function registerSingleOrganize(
  mail: Command,
  name: string,
  action: OrganizeAction,
  description: string,
  extraOptions?: (command: Command) => Command,
): void {
  let command = mail
    .command(name)
    .description(description)
    .argument("<ref>", "Message reference, e.g. INBOX::25642");

  if (extraOptions) {
    command = extraOptions(command);
  }

  addJsonOption(addOutputOption(addDryRunOption(command))).action(
    async (refArg: string, options: MoveOptions) => {
      try {
        await runSingleOrganize(refArg, action, options);
      } catch (error) {
        await handleCommandError(error);
      }
    },
  );
}

export function registerOrganize(mail: Command): void {
  registerSingleOrganize(
    mail,
    "move",
    "move",
    "Move a message to another mailbox",
    (command) => command.requiredOption("-t, --to <mailbox>", "Destination mailbox"),
  );

  registerSingleOrganize(mail, "archive", "archive", "Move a message to Archive");
  registerSingleOrganize(mail, "trash", "trash", "Move a message to Trash");
  registerSingleOrganize(
    mail,
    "restore",
    "restore",
    "Restore a message (default destination: INBOX)",
    (command) => command.option("-t, --to <mailbox>", "Destination mailbox", "INBOX"),
  );
  registerSingleOrganize(mail, "delete", "delete", "Permanently delete a message", (command) =>
    command.option(
      "-y, --yes",
      "Confirm destructive delete (or set PROTONMAIL_CONFIRM_DESTRUCTIVE=1)",
    ),
  );

  const mark = mail.command("mark").description("Mark message read state");
  registerSingleOrganize(mark, "read", "mark-read", "Mark a message as read");
  registerSingleOrganize(mark, "unread", "mark-unread", "Mark a message as unread");

  registerSingleOrganize(mail, "star", "star", "Star (flag) a message");
  registerSingleOrganize(mail, "unstar", "unstar", "Remove star from a message");

  const batchActions: Array<{ name: string; action: OrganizeAction; description: string }> = [
    { name: "move", action: "move", description: "Move messages to another mailbox" },
    { name: "archive", action: "archive", description: "Move messages to Archive" },
    { name: "trash", action: "trash", description: "Move messages to Trash" },
    { name: "restore", action: "restore", description: "Restore messages to INBOX" },
    { name: "delete", action: "delete", description: "Permanently delete messages" },
    { name: "read", action: "mark-read", description: "Mark messages as read" },
    { name: "unread", action: "mark-unread", description: "Mark messages as unread" },
    { name: "star", action: "star", description: "Star messages" },
    { name: "unstar", action: "unstar", description: "Unstar messages" },
  ];

  const batch = mail.command("batch").description("Organize multiple messages by reference");

  for (const entry of batchActions) {
    let command = batch
      .command(entry.name)
      .description(entry.description)
      .requiredOption(
        "--ids <refs>",
        "Message references (comma/space separated), e.g. INBOX::1,INBOX::2",
      );

    if (entry.action === "move") {
      command = command.requiredOption("-t, --to <mailbox>", "Destination mailbox");
    } else     if (entry.action === "restore") {
      command = command.option("-t, --to <mailbox>", "Destination mailbox", "INBOX");
    } else if (entry.action === "delete") {
      command = command.option(
        "-y, --yes",
        "Confirm destructive delete (or set PROTONMAIL_CONFIRM_DESTRUCTIVE=1)",
      );
    }

    addJsonOption(addOutputOption(addDryRunOption(command))).action(
      async (options: BatchOptions) => {
        try {
          const format = resolveFormat(options);
          setCommandOutputFormat(format);
          const refs = parseRefList(options.ids ?? "");
          const destination =
            entry.action === "move" || entry.action === "restore" ? options.to : undefined;

          if (!options.dryRun) {
            if (entry.action === "delete") {
              assertDestructiveAllowed({ yes: options.yes });
            } else {
              assertMutationAllowed();
            }
          }

          const result = await withImapSession((client) =>
            organizeMessages(client, refs, entry.action, {
              dryRun: options.dryRun,
              destination,
            }),
          );

          writeBatchResult(result, format);
        } catch (error) {
          await handleCommandError(error);
        }
      },
    );
  }
}
