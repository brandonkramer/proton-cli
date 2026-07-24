import type { ImapFlow, ListResponse } from "imapflow";
import { CliError } from "../util/errors.ts";
import { MailExitCode } from "../util/exit.ts";
import { cliErrorFromUnknown } from "../util/exit-map.ts";

export interface FolderSummary {
  path: string;
  name: string;
  delimiter: string;
  parentPath: string;
  specialUse: string | null;
  flags: string[];
  subscribed: boolean;
  messages: number | null;
  unseen: number | null;
}

export type SpecialMailboxPurpose = "inbox" | "archive" | "trash" | "sent" | "drafts" | "spam";

const SPECIAL_USE_BY_PURPOSE: Record<SpecialMailboxPurpose, string[]> = {
  inbox: ["\\Inbox"],
  archive: ["\\Archive", "\\All"],
  trash: ["\\Trash"],
  sent: ["\\Sent"],
  drafts: ["\\Drafts"],
  spam: ["\\Junk"],
};

const NAME_FALLBACKS: Record<SpecialMailboxPurpose, string[]> = {
  inbox: ["INBOX"],
  archive: ["Archive", "All Mail"],
  trash: ["Trash"],
  sent: ["Sent", "Sent Messages"],
  drafts: ["Drafts"],
  spam: ["Spam", "Junk"],
};

function summarizeFolder(entry: ListResponse): FolderSummary {
  return {
    path: entry.path,
    name: entry.name,
    delimiter: entry.delimiter,
    parentPath: entry.parentPath,
    specialUse: entry.specialUse ?? null,
    flags: [...entry.flags],
    subscribed: entry.subscribed,
    messages: entry.status?.messages ?? null,
    unseen: entry.status?.unseen ?? null,
  };
}

export async function listMailFolders(client: ImapFlow): Promise<FolderSummary[]> {
  try {
    const entries = await client.list({
      statusQuery: {
        messages: true,
        unseen: true,
      },
    });
    return entries
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(summarizeFolder);
  } catch (error) {
    throw cliErrorFromUnknown(error, "folders_list_failed");
  }
}

export function findSpecialMailbox(
  folders: FolderSummary[],
  purpose: SpecialMailboxPurpose,
): string | null {
  const specialUses = SPECIAL_USE_BY_PURPOSE[purpose];
  for (const specialUse of specialUses) {
    const match = folders.find((folder) => folder.specialUse === specialUse);
    if (match) return match.path;
  }

  const names = new Set(NAME_FALLBACKS[purpose].map((name) => name.toLowerCase()));
  const byName = folders.find((folder) => names.has(folder.name.toLowerCase()));
  return byName?.path ?? null;
}

export async function resolveSpecialMailbox(
  client: ImapFlow,
  purpose: SpecialMailboxPurpose,
): Promise<string> {
  const folders = await listMailFolders(client);
  const path = findSpecialMailbox(folders, purpose);
  if (!path) {
    throw new CliError(
      `Could not find ${purpose} mailbox via IMAP LIST.`,
      "mailbox_not_found",
      MailExitCode.NOT_FOUND,
    );
  }
  return path;
}
