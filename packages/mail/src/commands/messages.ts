import type { Command } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  listMailboxMessages,
  readMailboxMessage,
  searchMailboxMessages,
} from "../imap/messages.ts";
import { withImapSession } from "../imap/client.ts";
import {
  handleCommandError,
  setCommandOutputFormat,
} from "../util/command.ts";
import { parseMessageRef } from "../util/uid.ts";
import {
  addOutputOption,
  resolveOutputFormat,
  writeJson,
  writePlain,
} from "../util/output.ts";

interface CommonOutputOptions {
  output?: string;
  json?: boolean;
}

interface ListOptions extends CommonOutputOptions {
  mailbox?: string;
  limit?: string;
}

interface ReadOptions extends CommonOutputOptions {
  raw?: boolean;
}

interface SearchOptions extends CommonOutputOptions {
  mailbox?: string;
  text?: string;
  from?: string;
  to?: string;
  subject?: string;
  since?: string;
  before?: string;
  seen?: boolean;
  unseen?: boolean;
  idsOnly?: boolean;
}

function resolveFormat(options: CommonOutputOptions) {
  return resolveOutputFormat(options.output ?? (options.json ? "json" : undefined));
}

function addJsonOption(command: Command): Command {
  return command.option("--json", "Shorthand for --output json");
}

export function registerMessages(mail: Command): void {
  const messages = mail
    .command("messages")
    .description("List, read, and search messages via Bridge IMAP");

  addJsonOption(
    addOutputOption(
      messages
        .command("list")
        .description("List messages in a mailbox (default: INBOX)")
        .option("-m, --mailbox <name>", "Mailbox name", "INBOX")
        .option("-l, --limit <count>", "Maximum messages to return", "20"),
    ),
  ).action(async (options: ListOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);
      const limit = Math.max(1, Number.parseInt(options.limit ?? "20", 10) || 20);
      const mailbox = options.mailbox?.trim() || "INBOX";

      const items = await withImapSession((client) =>
        listMailboxMessages(client, mailbox, limit),
      );

      if (format === "json") {
        writeJson({ ok: true, mailbox, limit, count: items.length, messages: items });
        return;
      }

      if (items.length === 0) {
        writePlain(`No messages in ${mailbox}.`);
        return;
      }

      writePlain(
        items.map((item) =>
          [
            item.ref,
            item.date ?? "",
            item.from.join(", "),
            item.subject ?? "(no subject)",
            item.seen ? "read" : "unread",
          ].join("\t"),
        ),
      );
    } catch (error) {
      await handleCommandError(error);
    }
  });

  addJsonOption(
    addOutputOption(
      messages
        .command("read")
        .description("Read a message by Mailbox::uid reference")
        .argument("<ref>", "Message reference, e.g. INBOX::25642")
        .option("--raw", "Include full RFC822 source"),
    ),
  ).action(async (refArg: string, options: ReadOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);
      const ref = parseMessageRef(refArg);

      const message = await withImapSession((client) =>
        readMailboxMessage(client, ref.mailbox, ref.uid, { raw: options.raw }),
      );

      if (format === "json") {
        writeJson({ ok: true, message });
        return;
      }

      writePlain([
        `ref\t${message.ref}`,
        `subject\t${message.subject ?? ""}`,
        `from\t${message.from.join(", ")}`,
        `to\t${message.to.join(", ")}`,
        `date\t${message.date ?? ""}`,
        `flags\t${message.flags.join(" ")}`,
        "",
        message.text ?? message.html ?? "(no body)",
        ...(options.raw && message.raw ? ["", "--- raw ---", message.raw] : []),
      ]);
    } catch (error) {
      await handleCommandError(error);
    }
  });

  addJsonOption(
    addOutputOption(
      messages
        .command("search")
        .description("Search messages via IMAP SEARCH")
        .option("-m, --mailbox <name>", "Mailbox name", "INBOX")
        .option("--text <keyword>", "Match text in headers or body")
        .option("--from <address>", "Match From header")
        .option("--to <address>", "Match To header")
        .option("--subject <text>", "Match Subject header")
        .option("--since <date>", "Received on or after date (ISO)")
        .option("--before <date>", "Received before date (ISO)")
        .option("--seen", "Only seen messages")
        .option("--unseen", "Only unseen messages")
        .option("--ids-only", "Print only Mailbox::uid refs"),
    ),
  ).action(async (options: SearchOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);
      const mailbox = options.mailbox?.trim() || "INBOX";
      const query = {
        text: options.text,
        from: options.from,
        to: options.to,
        subject: options.subject,
        since: options.since,
        before: options.before,
        seen: options.seen ? true : undefined,
        unseen: options.unseen ? true : undefined,
      };

      const result = await withImapSession((client) =>
        searchMailboxMessages(client, mailbox, query),
      );

      if (format === "json") {
        writeJson({ ok: true, ...result, count: result.ids.length });
        return;
      }

      if (options.idsOnly) {
        writePlain(result.ids);
        return;
      }

      writePlain([
        `mailbox\t${result.mailbox}`,
        `count\t${result.ids.length}`,
        ...result.ids,
      ]);
    } catch (error) {
      await handleCommandError(error);
    }
  });

  addJsonOption(
    addOutputOption(
      mail
        .command("inbox")
        .description("List INBOX messages (alias for messages list)")
        .option("-l, --limit <count>", "Maximum messages to return", "20"),
    ),
  ).action(async (options: ListOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);
      const limit = Math.max(1, Number.parseInt(options.limit ?? "20", 10) || 20);

      const items = await withImapSession((client) =>
        listMailboxMessages(client, "INBOX", limit),
      );

      if (format === "json") {
        writeJson({ ok: true, mailbox: "INBOX", limit, count: items.length, messages: items });
        return;
      }

      if (items.length === 0) {
        writePlain("No messages in INBOX.");
        return;
      }

      writePlain(
        items.map((item) =>
          [
            item.ref,
            item.date ?? "",
            item.from.join(", "),
            item.subject ?? "(no subject)",
            item.seen ? "read" : "unread",
          ].join("\t"),
        ),
      );
    } catch (error) {
      await handleCommandError(error);
    }
  });
}

export function registerMessagesGetAlias(mail: Command): void {
  addJsonOption(
    addOutputOption(
      mail
        .command("get")
        .description("Read a message by Mailbox::uid reference")
        .argument("<ref>", "Message reference, e.g. INBOX::25642")
        .option("--raw", "Include full RFC822 source"),
    ),
  ).action(async (refArg: string, options: ReadOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);
      const ref = parseMessageRef(refArg);

      const message = await withImapSession((client) =>
        readMailboxMessage(client, ref.mailbox, ref.uid, { raw: options.raw }),
      );

      if (format === "json") {
        writeJson({ ok: true, message });
        return;
      }

      writePlain([
        `ref\t${message.ref}`,
        `subject\t${message.subject ?? ""}`,
        `from\t${message.from.join(", ")}`,
        `to\t${message.to.join(", ")}`,
        `date\t${message.date ?? ""}`,
        `flags\t${message.flags.join(" ")}`,
        "",
        message.text ?? message.html ?? "(no body)",
        ...(options.raw && message.raw ? ["", "--- raw ---", message.raw] : []),
      ]);
    } catch (error) {
      await handleCommandError(error);
    }
  });
}

export async function saveAttachmentContent(
  filename: string | null,
  content: Buffer,
  outputPath?: string,
): Promise<string> {
  const target = outputPath?.trim() || filename || "attachment.bin";
  await mkdir(path.dirname(path.resolve(target)), { recursive: true });
  await writeFile(target, content);
  return target;
}
