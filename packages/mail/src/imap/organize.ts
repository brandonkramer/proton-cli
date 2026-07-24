import type { ImapFlow } from "imapflow";
import { CliError } from "../util/errors.ts";
import { MailExitCode } from "../util/exit.ts";
import { formatMessageRef, type MessageRef } from "../util/uid.ts";
import { cliErrorFromUnknown } from "../util/exit-map.ts";
import { resolveSpecialMailbox } from "./folders.ts";
import { selectMailbox } from "./client.ts";

export type OrganizeAction =
  | "move"
  | "archive"
  | "trash"
  | "restore"
  | "mark-read"
  | "mark-unread"
  | "star"
  | "unstar"
  | "delete";

export interface OrganizeOptions {
  dryRun?: boolean;
  destination?: string;
}

export interface OrganizeItemResult {
  action: OrganizeAction;
  ref: string;
  mailbox: string;
  uid: number;
  dryRun: boolean;
  destination?: string;
  flags?: string[];
}

export interface OrganizeBatchResult {
  action: OrganizeAction;
  dryRun: boolean;
  results: OrganizeItemResult[];
}

const FLAG_ACTIONS: Record<
  "mark-read" | "mark-unread" | "star" | "unstar",
  { add?: string[]; remove?: string[]; flags: string[] }
> = {
  "mark-read": { add: ["\\Seen"], flags: ["\\Seen"] },
  "mark-unread": { remove: ["\\Seen"], flags: [] },
  star: { add: ["\\Flagged"], flags: ["\\Flagged"] },
  unstar: { remove: ["\\Flagged"], flags: [] },
};

export async function organizeMessage(
  client: ImapFlow,
  ref: MessageRef,
  action: OrganizeAction,
  options: OrganizeOptions = {},
): Promise<OrganizeItemResult> {
  const dryRun = options.dryRun === true;
  const preview = await buildOrganizePreview(client, ref, action, options);

  if (dryRun) {
    return preview;
  }

  const lock = await selectMailbox(client, ref.mailbox);
  try {
    await applyOrganizeMutation(client, ref, action, preview.destination);
    return preview;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw cliErrorFromUnknown(error, "organize_failed");
  } finally {
    lock.release();
  }
}

export async function organizeMessages(
  client: ImapFlow,
  refs: MessageRef[],
  action: OrganizeAction,
  options: OrganizeOptions = {},
): Promise<OrganizeBatchResult> {
  if (refs.length === 0) {
    throw new CliError(
      "At least one message reference is required.",
      "missing_message_refs",
      MailExitCode.USER,
    );
  }

  const results: OrganizeItemResult[] = [];
  for (const ref of refs) {
    results.push(await organizeMessage(client, ref, action, options));
  }

  return {
    action,
    dryRun: options.dryRun === true,
    results,
  };
}

async function buildOrganizePreview(
  client: ImapFlow,
  ref: MessageRef,
  action: OrganizeAction,
  options: OrganizeOptions,
): Promise<OrganizeItemResult> {
  const dryRun = options.dryRun === true;
  const base: OrganizeItemResult = {
    action,
    ref: formatMessageRef(ref.mailbox, ref.uid),
    mailbox: ref.mailbox,
    uid: ref.uid,
    dryRun,
  };

  switch (action) {
    case "move": {
      const destination = requireDestination(options.destination, "move");
      return { ...base, destination };
    }
    case "archive":
      return { ...base, destination: await resolveSpecialMailbox(client, "archive") };
    case "trash":
      return { ...base, destination: await resolveSpecialMailbox(client, "trash") };
    case "restore": {
      const destination =
        options.destination?.trim() || (await resolveSpecialMailbox(client, "inbox"));
      return { ...base, destination };
    }
    case "mark-read":
    case "mark-unread":
    case "star":
    case "unstar":
      return { ...base, flags: FLAG_ACTIONS[action].flags };
    case "delete":
      return base;
    default: {
      const exhaustive: never = action;
      throw new CliError(
        `Unsupported organize action: ${String(exhaustive)}`,
        "invalid_organize_action",
        MailExitCode.USER,
      );
    }
  }
}

async function applyOrganizeMutation(
  client: ImapFlow,
  ref: MessageRef,
  action: OrganizeAction,
  destination?: string,
): Promise<void> {
  const uidRange = [ref.uid];

  switch (action) {
    case "move":
    case "archive":
    case "trash":
    case "restore": {
      if (!destination) {
        throw new CliError(
          "Destination mailbox is required.",
          "missing_destination",
          MailExitCode.USER,
        );
      }
      await client.messageMove(uidRange, destination, { uid: true });
      return;
    }
    case "mark-read":
    case "mark-unread":
    case "star":
    case "unstar": {
      const flagAction = FLAG_ACTIONS[action];
      if (flagAction.add?.length) {
        await client.messageFlagsAdd(uidRange, flagAction.add, { uid: true });
      }
      if (flagAction.remove?.length) {
        await client.messageFlagsRemove(uidRange, flagAction.remove, { uid: true });
      }
      return;
    }
    case "delete":
      await client.messageDelete(uidRange, { uid: true });
      return;
    default: {
      const exhaustive: never = action;
      throw new CliError(
        `Unsupported organize action: ${String(exhaustive)}`,
        "invalid_organize_action",
        MailExitCode.USER,
      );
    }
  }
}

function requireDestination(destination: string | undefined, action: string): string {
  const trimmed = destination?.trim();
  if (!trimmed) {
    throw new CliError(
      `Destination mailbox is required for ${action}. Use --to <mailbox>.`,
      "missing_destination",
      MailExitCode.USER,
    );
  }
  return trimmed;
}
