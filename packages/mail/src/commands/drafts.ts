import type { Transporter } from "nodemailer";
import type { Command } from "commander";
import { readFile } from "node:fs/promises";
import { loadMailConfig } from "../config/store.ts";
import { withImapSession } from "../imap/client.ts";
import {
  deleteDraftMessage,
  listDraftMessages,
  readDraftMessage,
  saveDraftMessage,
  sendDraftMessage,
  type DeleteDraftResult,
  type SaveDraftResult,
  type SendDraftResult,
} from "../imap/drafts.ts";
import { resolveFromAddress, withSmtpSession } from "../smtp/index.ts";
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
import {
  assertDestructiveAllowed,
  assertMutationAllowed,
  assertSendAllowed,
} from "../util/safety.ts";
import { parseMessageRef } from "../util/uid.ts";

interface CommonDraftOptions {
  output?: string;
  json?: boolean;
  dryRun?: boolean;
}

interface SaveDraftOptions extends CommonDraftOptions {
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  bodyFile?: string;
  update?: string;
}

interface DeleteDraftOptions extends CommonDraftOptions {
  yes?: boolean;
}

interface ListDraftOptions extends CommonDraftOptions {
  limit?: string;
}

function resolveFormat(options: CommonDraftOptions) {
  return resolveOutputFormat(options.output ?? (options.json ? "json" : undefined));
}

function addJsonOption(command: Command): Command {
  return command.option("--json", "Shorthand for --output json");
}

function addDryRunOption(command: Command): Command {
  return command.option(
    "--dry-run",
    "Preview draft mutations without IMAP/SMTP changes",
  );
}

function parseAddressList(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
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

function writeDraftList(
  items: Awaited<ReturnType<typeof listDraftMessages>>,
  format: ReturnType<typeof resolveOutputFormat>,
): void {
  if (format === "json") {
    writeJson({ ok: true, count: items.length, drafts: items });
    return;
  }

  writePlain([
    `count\t${items.length}`,
    ...items.map((item) =>
      [item.ref, item.subject ?? "", item.from.join(", "), item.date ?? ""].join("\t"),
    ),
  ]);
}

function writeDraftDetail(
  draft: Awaited<ReturnType<typeof readDraftMessage>>,
  format: ReturnType<typeof resolveOutputFormat>,
): void {
  if (format === "json") {
    writeJson({ ok: true, draft });
    return;
  }

  writePlain([
    `ref\t${draft.ref}`,
    `subject\t${draft.subject ?? ""}`,
    `from\t${draft.from.join(", ")}`,
    `to\t${draft.to.join(", ")}`,
    ...(draft.cc.length ? [`cc\t${draft.cc.join(", ")}`] : []),
    ...(draft.date ? [`date\t${draft.date}`] : []),
    ...(draft.text ? ["", draft.text] : []),
  ]);
}

function writeSaveResult(
  result: SaveDraftResult,
  format: ReturnType<typeof resolveOutputFormat>,
): void {
  if (format === "json") {
    writeJson({ ok: true, ...result });
    return;
  }

  writePlain([
    result.dryRun ? "dry-run\ttrue" : "saved\ttrue",
    `ref\t${result.ref}`,
    ...(result.updated ? [`updated\t${result.updated}`] : []),
  ]);
}

function writeDeleteResult(
  result: DeleteDraftResult,
  format: ReturnType<typeof resolveOutputFormat>,
): void {
  if (format === "json") {
    writeJson({ ok: true, ...result });
    return;
  }

  writePlain([
    result.dryRun ? "dry-run\ttrue" : "deleted\ttrue",
    `ref\t${result.ref}`,
  ]);
}

function writeSendResult(
  result: SendDraftResult,
  format: ReturnType<typeof resolveOutputFormat>,
): void {
  if (format === "json") {
    writeJson({
      ok: true,
      ref: result.ref,
      dryRun: result.dryRun,
      deleted: result.deleted,
      messageId: result.deliver.messageId,
      mail: result.deliver.preview,
    });
    return;
  }

  writePlain([
    result.dryRun ? "dry-run\ttrue" : "sent\ttrue",
    `ref\t${result.ref}`,
    ...(result.deliver.messageId ? [`message-id\t${result.deliver.messageId}`] : []),
    ...(result.deleted ? ["draft-deleted\ttrue"] : []),
    `to\t${result.deliver.preview.to.join(", ")}`,
    `subject\t${result.deliver.preview.subject}`,
  ]);
}

async function deliverDraftWithOptionalSmtp<T>(
  dryRun: boolean | undefined,
  deliver: (transport?: Transporter) => Promise<T>,
): Promise<T> {
  if (dryRun) {
    return deliver(undefined);
  }
  return withSmtpSession(async (transport) => deliver(transport));
}

export function registerDrafts(mail: Command): void {
  const drafts = mail
    .command("drafts")
    .description("List, save, send, and delete drafts via Bridge IMAP");

  addJsonOption(
    addOutputOption(
      drafts
        .command("list")
        .description("List drafts in the Drafts mailbox")
        .option("-l, --limit <count>", "Maximum drafts to return", "20"),
    ),
  ).action(async (options: ListDraftOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);
      const limit = Math.max(1, Number.parseInt(options.limit ?? "20", 10) || 20);

      const items = await withImapSession((client) => listDraftMessages(client, limit));
      writeDraftList(items, format);
    } catch (error) {
      await handleCommandError(error);
    }
  });

  addJsonOption(
    addOutputOption(
      drafts
        .command("get")
        .description("Read a draft by reference (e.g. Drafts::42)")
        .argument("<ref>", "Draft reference"),
    ),
  ).action(async (refArg: string, options: CommonDraftOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);
      const ref = parseMessageRef(refArg);

      const draft = await withImapSession((client) => readDraftMessage(client, ref.uid));
      writeDraftDetail(draft, format);
    } catch (error) {
      await handleCommandError(error);
    }
  });

  addJsonOption(
    addOutputOption(
      addDryRunOption(
        drafts
          .command("save")
          .description("Create or update a draft in the Drafts mailbox")
          .option("--to <addresses>", "Recipient address(es), comma-separated")
          .option("--cc <addresses>", "Cc address(es), comma-separated")
          .option("--subject <text>", "Message subject")
          .option("--body <text>", "Plain-text body")
          .option("--body-file <path>", "Read body from file")
          .option(
            "--update <ref>",
            "Replace an existing draft (Drafts::uid) after saving the new version",
          ),
      ),
    ),
  ).action(async (options: SaveDraftOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);
      if (!options.dryRun) {
        assertMutationAllowed();
      }

      const body = await resolveBody(options);
      const to = parseAddressList(options.to);
      const cc = parseAddressList(options.cc);
      const updateRef = options.update?.trim()
        ? parseMessageRef(options.update.trim())
        : undefined;

      const result = await withImapSession(async (client, config) => {
        const from = await resolveFromAddress(config);
        return saveDraftMessage(
          client,
          {
            from,
            to,
            cc,
            subject: options.subject,
            body,
          },
          { dryRun: options.dryRun, updateRef },
        );
      });

      writeSaveResult(result, format);
    } catch (error) {
      await handleCommandError(error);
    }
  });

  addJsonOption(
    addOutputOption(
      addDryRunOption(
        drafts
          .command("delete")
          .description("Delete a draft permanently")
          .argument("<ref>", "Draft reference, e.g. Drafts::42")
          .option("-y, --yes", "Confirm destructive delete (or set PROTONMAIL_CONFIRM_DESTRUCTIVE=1)"),
      ),
    ),
  ).action(async (refArg: string, options: DeleteDraftOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);
      if (!options.dryRun) {
        assertDestructiveAllowed({ yes: options.yes });
      }

      const ref = parseMessageRef(refArg);
      const result = await withImapSession((client) =>
        deleteDraftMessage(client, ref, { dryRun: options.dryRun }),
      );

      writeDeleteResult(result, format);
    } catch (error) {
      await handleCommandError(error);
    }
  });

  addJsonOption(
    addOutputOption(
      addDryRunOption(
        drafts
          .command("send")
          .description("Send a draft via Bridge SMTP and remove it from Drafts")
          .argument("<ref>", "Draft reference, e.g. Drafts::42"),
      ),
    ),
  ).action(async (refArg: string, options: CommonDraftOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);
      assertSendAllowed();
      if (!options.dryRun) {
        assertMutationAllowed();
      }

      const ref = parseMessageRef(refArg);

      const result = await withImapSession(async (client, config) => {
        const from = await resolveFromAddress(config);
        return deliverDraftWithOptionalSmtp(options.dryRun, async (transport) =>
          sendDraftMessage(client, ref, {
            dryRun: options.dryRun,
            transport,
            from,
          }),
        );
      });

      writeSendResult(result, format);
    } catch (error) {
      await handleCommandError(error);
    }
  });
}
