import type { Transporter } from "nodemailer";
import type { Command } from "commander";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadMailConfig } from "../config/store.ts";
import { withImapSession } from "../imap/client.ts";
import { readMailboxMessage } from "../imap/messages.ts";
import { parseMessageHeaders } from "../mime/headers.ts";
import {
  deliverForward,
  deliverReply,
  deliverSend,
  resolveFromAddress,
  withSmtpSession,
  type OutgoingAttachment,
} from "../smtp/index.ts";
import {
  handleCommandError,
  setCommandOutputFormat,
} from "../util/command.ts";
import { CliError } from "../util/errors.ts";
import { MailExitCode } from "../util/exit.ts";
import {
  addOutputOption,
  resolveOutputFormat,
  writeJson,
  writePlain,
} from "../util/output.ts";
import { assertSendAllowed } from "../util/safety.ts";
import { parseMessageRef } from "../util/uid.ts";

interface CommonSendOptions {
  output?: string;
  json?: boolean;
  dryRun?: boolean;
}

interface SendOptions extends CommonSendOptions {
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  bodyFile?: string;
  attachment?: string[];
}

interface ReplyOptions extends CommonSendOptions {
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  bodyFile?: string;
  attachment?: string[];
}

interface ForwardOptions extends CommonSendOptions {
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  bodyFile?: string;
  attachment?: string[];
}

function resolveFormat(options: CommonSendOptions) {
  return resolveOutputFormat(options.output ?? (options.json ? "json" : undefined));
}

function addJsonOption(command: Command): Command {
  return command.option("--json", "Shorthand for --output json");
}

function addSendSafetyOptions(command: Command): Command {
  return command.option(
    "--dry-run",
    "Print the intended send without opening an SMTP DATA transaction",
  );
}

function parseAddressList(value: string | undefined, label: string): string[] {
  if (!value?.trim()) return [];
  const parts = value
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new CliError(`${label} must include at least one address.`, "invalid_address", MailExitCode.USER);
  }
  return parts;
}

function requireAddressList(value: string | undefined, label: string): string[] {
  const parts = parseAddressList(value, label);
  if (parts.length === 0) {
    throw new CliError(`${label} is required.`, "missing_address", MailExitCode.USER);
  }
  return parts;
}

async function resolveBody(options: {
  body?: string;
  bodyFile?: string;
}): Promise<string | undefined> {
  if (options.body !== undefined) {
    return options.body;
  }
  if (options.bodyFile?.trim()) {
    return await readFile(options.bodyFile.trim(), "utf8");
  }
  return undefined;
}

async function resolveAttachments(paths: string[] | undefined): Promise<OutgoingAttachment[]> {
  if (!paths?.length) return [];
  const attachments: OutgoingAttachment[] = [];
  for (const entry of paths) {
    const resolved = path.resolve(entry.trim());
    attachments.push({
      filename: path.basename(resolved),
      path: resolved,
    });
  }
  return attachments;
}

function writeDeliverResult(
  action: "send" | "reply" | "forward",
  result: Awaited<ReturnType<typeof deliverSend>>,
  format: ReturnType<typeof resolveOutputFormat>,
): void {
  if (format === "json") {
    writeJson({
      ok: true,
      action,
      dryRun: result.dryRun,
      messageId: result.messageId,
      mail: result.preview,
    });
    return;
  }

  const lines = [
    result.dryRun ? "dry-run\ttrue" : "sent\ttrue",
    `action\t${action}`,
    `from\t${result.preview.from}`,
    `to\t${result.preview.to.join(", ")}`,
    ...(result.preview.cc?.length ? [`cc\t${result.preview.cc.join(", ")}`] : []),
    `subject\t${result.preview.subject}`,
    ...(result.messageId ? [`message-id\t${result.messageId}`] : []),
    ...(result.preview.text ? ["", result.preview.text] : []),
  ];
  writePlain(lines);
}

async function loadConfiguredMail() {
  const config = await loadMailConfig();
  if (!config) {
    throw new CliError(
      "Mail is not configured.\nRun `proton mail setup` first.",
      "config_missing",
      MailExitCode.AUTH,
    );
  }
  return config;
}

async function deliverWithOptionalSmtp<T>(
  dryRun: boolean | undefined,
  deliver: (transport?: Transporter) => Promise<T>,
): Promise<T> {
  if (dryRun) {
    return deliver(undefined);
  }
  return withSmtpSession(async (transport) => deliver(transport));
}

export function registerSend(mail: Command): void {
  addJsonOption(
    addOutputOption(
      addSendSafetyOptions(
        mail
          .command("send")
          .description("Send a message via Bridge SMTP")
          .requiredOption("--to <addresses>", "Recipient address(es), comma-separated")
          .option("--cc <addresses>", "Cc address(es), comma-separated")
          .requiredOption("--subject <text>", "Message subject")
          .option("--body <text>", "Plain-text body")
          .option("--body-file <path>", "Read body from file")
          .option(
            "-a, --attachment <path>",
            "Attachment path (repeatable)",
            collectValues,
            [],
          ),
      ),
    ),
  ).action(async (options: SendOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);
      assertSendAllowed();

      const to = requireAddressList(options.to, "--to");
      const cc = parseAddressList(options.cc, "--cc");
      const body = await resolveBody(options);
      const attachments = await resolveAttachments(options.attachment);

      const result = await deliverWithOptionalSmtp(options.dryRun, async (transport) => {
        const config = await loadConfiguredMail();
        const from = await resolveFromAddress(config);
        return deliverSend(
          {
            from,
            to,
            cc,
            subject: options.subject?.trim() || "(no subject)",
            body,
            attachments,
          },
          { dryRun: options.dryRun, transport },
        );
      });

      writeDeliverResult("send", result, format);
    } catch (error) {
      await handleCommandError(error);
    }
  });

  addJsonOption(
    addOutputOption(
      addSendSafetyOptions(
        mail
          .command("reply")
          .description("Reply to a message via Bridge SMTP")
          .argument("<ref>", "Message reference, e.g. INBOX::25642")
          .option("--to <addresses>", "Override reply recipient(s)")
          .option("--cc <addresses>", "Cc address(es), comma-separated")
          .option("--subject <text>", "Override subject")
          .option("--body <text>", "Plain-text body")
          .option("--body-file <path>", "Read body from file")
          .option(
            "-a, --attachment <path>",
            "Attachment path (repeatable)",
            collectValues,
            [],
          ),
      ),
    ),
  ).action(async (refArg: string, options: ReplyOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);
      assertSendAllowed();

      const ref = parseMessageRef(refArg);
      const body = await resolveBody(options);
      const attachments = await resolveAttachments(options.attachment);
      const to = parseAddressList(options.to, "--to");
      const cc = parseAddressList(options.cc, "--cc");

      const original = await withImapSession(async (client) => {
        const message = await readMailboxMessage(client, ref.mailbox, ref.uid, {
          raw: true,
        });
        if (!message.raw) {
          throw new CliError(
            `Could not load source for ${message.ref}.`,
            "message_source_missing",
            MailExitCode.NOT_FOUND,
          );
        }
        return parseMessageHeaders(Buffer.from(message.raw, "utf8"));
      });

      const result = await deliverWithOptionalSmtp(options.dryRun, async (transport) => {
        const config = await loadConfiguredMail();
        const from = await resolveFromAddress(config);
        return deliverReply(
          original,
          {
            from,
            body,
            subject: options.subject,
            to: to.length ? to : undefined,
            cc,
            attachments,
          },
          { dryRun: options.dryRun, transport },
        );
      });

      writeDeliverResult("reply", result, format);
    } catch (error) {
      await handleCommandError(error);
    }
  });

  addJsonOption(
    addOutputOption(
      addSendSafetyOptions(
        mail
          .command("forward")
          .description("Forward a message via Bridge SMTP")
          .argument("<ref>", "Message reference, e.g. INBOX::25642")
          .requiredOption("--to <addresses>", "Recipient address(es), comma-separated")
          .option("--cc <addresses>", "Cc address(es), comma-separated")
          .option("--subject <text>", "Override subject")
          .option("--body <text>", "Note to prepend before forwarded content")
          .option("--body-file <path>", "Read note from file")
          .option(
            "-a, --attachment <path>",
            "Attachment path (repeatable)",
            collectValues,
            [],
          ),
      ),
    ),
  ).action(async (refArg: string, options: ForwardOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);
      assertSendAllowed();

      const ref = parseMessageRef(refArg);
      const body = await resolveBody(options);
      const attachments = await resolveAttachments(options.attachment);
      const to = requireAddressList(options.to, "--to");
      const cc = parseAddressList(options.cc, "--cc");

      const original = await withImapSession(async (client) => {
        const message = await readMailboxMessage(client, ref.mailbox, ref.uid, {
          raw: true,
        });
        if (!message.raw) {
          throw new CliError(
            `Could not load source for ${message.ref}.`,
            "message_source_missing",
            MailExitCode.NOT_FOUND,
          );
        }
        return parseMessageHeaders(Buffer.from(message.raw, "utf8"));
      });

      const result = await deliverWithOptionalSmtp(options.dryRun, async (transport) => {
        const config = await loadConfiguredMail();
        const from = await resolveFromAddress(config);
        return deliverForward(
          original,
          {
            from,
            to,
            body,
            subject: options.subject,
            cc,
            attachments,
          },
          { dryRun: options.dryRun, transport },
        );
      });

      writeDeliverResult("forward", result, format);
    } catch (error) {
      await handleCommandError(error);
    }
  });
}

function collectValues(value: string, previous: string[]): string[] {
  return previous.concat(value);
}
