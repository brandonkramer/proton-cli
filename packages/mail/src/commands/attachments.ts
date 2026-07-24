import type { Command } from "commander";
import {
  downloadMessageAttachment,
  listMessageAttachments,
} from "../imap/messages.ts";
import { withImapSession } from "../imap/client.ts";
import { saveAttachmentContent } from "./messages.ts";
import {
  handleCommandError,
  setCommandOutputFormat,
} from "../util/command.ts";
import { parseMessageRef } from "../util/uid.ts";
import { CliError } from "../util/errors.ts";
import { MailExitCode } from "../util/exit.ts";
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

interface DownloadOptions extends CommonOutputOptions {
  part?: string;
  all?: boolean;
  out?: string;
  stdout?: boolean;
}

function resolveFormat(options: CommonOutputOptions) {
  return resolveOutputFormat(options.output ?? (options.json ? "json" : undefined));
}

function addJsonOption(command: Command): Command {
  return command.option("--json", "Shorthand for --output json");
}

export function registerAttachments(mail: Command): void {
  const attachments = mail
    .command("attachments")
    .description("List and download message attachments");

  addJsonOption(
    addOutputOption(
      attachments
        .command("list")
        .description("List attachments on a message")
        .argument("<ref>", "Message reference, e.g. INBOX::25642"),
    ),
  ).action(async (refArg: string, options: CommonOutputOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);
      const ref = parseMessageRef(refArg);

      const items = await withImapSession((client) =>
        listMessageAttachments(client, ref.mailbox, ref.uid),
      );

      if (format === "json") {
        writeJson({
          ok: true,
          ref: refArg.trim(),
          count: items.length,
          attachments: items,
        });
        return;
      }

      if (items.length === 0) {
        writePlain(`No attachments on ${refArg.trim()}.`);
        return;
      }

      writePlain(
        items.map((item) =>
          [
            item.part,
            item.filename ?? "",
            item.contentType,
            item.size?.toString() ?? "",
          ].join("\t"),
        ),
      );
    } catch (error) {
      await handleCommandError(error);
    }
  });

  addJsonOption(
    addOutputOption(
      attachments
        .command("download")
        .description("Download one or all attachments for a message")
        .argument("<ref>", "Message reference, e.g. INBOX::25642")
        .option("-p, --part <id>", "Body part id from attachments list")
        .option("--all", "Download all attachments")
        .option("-o, --out <path>", "Output file or directory")
        .option("--stdout", "Write attachment bytes to stdout (single part only)"),
    ),
  ).action(async (refArg: string, options: DownloadOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);
      const ref = parseMessageRef(refArg);

      if (options.stdout && options.all) {
        throw new CliError(
          "--stdout cannot be used with --all.",
          "invalid_download_options",
          MailExitCode.USER,
        );
      }

      const parts = await withImapSession(async (client) => {
        const listed = await listMessageAttachments(client, ref.mailbox, ref.uid);
        if (listed.length === 0) {
          throw new CliError(
            `No attachments on ${refArg.trim()}.`,
            "attachments_not_found",
            MailExitCode.NOT_FOUND,
          );
        }

        const selected = selectDownloadParts(listed, options);
        const downloaded = [];
        for (const part of selected) {
          const file = await downloadMessageAttachment(
            client,
            ref.mailbox,
            ref.uid,
            part.part,
          );
          downloaded.push(file);
        }
        return downloaded;
      });

      if (options.stdout) {
        const file = parts[0]!;
        process.stdout.write(file.content);
        return;
      }

      const saved = [];
      for (const file of parts) {
        const target = options.out?.trim()
          ? options.all
            ? pathJoin(options.out, file.filename ?? `part-${file.part}.bin`)
            : options.out
          : file.filename ?? `attachment-${file.part}.bin`;
        const written = await saveAttachmentContent(file.filename, file.content, target);
        saved.push({
          part: file.part,
          filename: file.filename,
          path: written,
          bytes: file.content.length,
        });
      }

      if (format === "json") {
        writeJson({ ok: true, ref: refArg.trim(), saved });
        return;
      }

      writePlain(saved.map((entry) => `${entry.part}\t${entry.path}\t${entry.bytes}`));
    } catch (error) {
      await handleCommandError(error);
    }
  });
}

function selectDownloadParts(
  listed: Array<{ part: string }>,
  options: DownloadOptions,
): Array<{ part: string }> {
  if (options.all) return listed;

  const part = options.part?.trim();
  if (!part) {
    if (listed.length === 1) return listed;
    throw new CliError(
      "Specify --part <id> or --all. Run `proton mail attachments list <ref>` first.",
      "attachment_part_required",
      MailExitCode.USER,
    );
  }

  const match = listed.find((item) => item.part === part);
  if (!match) {
    throw new CliError(
      `Attachment part "${part}" not found on message.`,
      "attachment_not_found",
      MailExitCode.NOT_FOUND,
    );
  }
  return [match];
}

function pathJoin(base: string, name: string): string {
  return `${base.replace(/\/$/, "")}/${name}`;
}
