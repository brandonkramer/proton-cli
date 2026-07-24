import type { Command } from "commander";
import { listMailFolders } from "../imap/folders.ts";
import { withImapSession } from "../imap/client.ts";
import {
  handleCommandError,
  setCommandOutputFormat,
} from "../util/command.ts";
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

function resolveFormat(options: CommonOutputOptions) {
  return resolveOutputFormat(options.output ?? (options.json ? "json" : undefined));
}

function addJsonOption(command: Command): Command {
  return command.option("--json", "Shorthand for --output json");
}

function registerFolderList(parent: Command, description: string): void {
  addJsonOption(
    addOutputOption(
      parent
        .command("list")
        .alias("ls")
        .description(description),
    ),
  ).action(async (options: CommonOutputOptions) => {
    try {
      const format = resolveFormat(options);
      setCommandOutputFormat(format);

      const folders = await withImapSession((client) => listMailFolders(client));

      if (format === "json") {
        writeJson({ ok: true, count: folders.length, folders });
        return;
      }

      if (folders.length === 0) {
        writePlain("No folders found.");
        return;
      }

      writePlain(
        folders.map((folder) =>
          [
            folder.path,
            folder.specialUse ?? "",
            folder.messages ?? "",
            folder.unseen ?? "",
            folder.subscribed ? "subscribed" : "",
          ].join("\t"),
        ),
      );
    } catch (error) {
      await handleCommandError(error);
    }
  });
}

export function registerFolders(mail: Command): void {
  const folders = mail
    .command("folders")
    .description("List mailboxes via Bridge IMAP LIST");

  registerFolderList(folders, "List mailboxes (IMAP LIST)");

  const mailboxes = mail
    .command("mailboxes")
    .description("Alias for folders (IMAP LIST)");

  registerFolderList(mailboxes, "List mailboxes (IMAP LIST)");
}
