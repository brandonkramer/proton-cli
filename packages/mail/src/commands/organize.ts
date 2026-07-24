import type { Command } from "commander";
import { requireMailRuntime } from "../context.ts";
import {
  applyLabel,
  moveMessages,
  permanentlyDeleteMessages,
  readMessages,
  removeLabel,
  starMessages,
  trashMessages,
  unreadMessages,
  unstarMessages,
} from "../service/organize.ts";
import { LABEL_STARRED, LABEL_TRASH } from "../proton/constants.ts";
import { emitOk, isDryRun, wantsJson } from "../util/agent.ts";
import { reportCommandError } from "../util/errors.ts";
import { assertWriteAllowed, assertYesConfirmed } from "../util/safety.ts";

interface OrganizeActionOptions {
  messageIds: string[];
  passRef?: string;
  to?: string;
  from?: string;
  label?: string;
}

function dryRunPayload(
  action: string,
  messageIds: string[],
  extra: Record<string, unknown> = {},
): void {
  emitOk({
    dryRun: true,
    action,
    messageIds,
    count: messageIds.length,
    ...extra,
  });
}

function successPayload(
  action: string,
  messageIds: string[],
  extra: Record<string, unknown> = {},
): void {
  emitOk({
    action,
    messageIds,
    count: messageIds.length,
    ...extra,
    ...(wantsJson() ? {} : { message: `${action}: ${messageIds.length} message(s)` }),
  });
}

async function runOrganizeAction(
  action: string,
  messageIds: string[],
  run: (session: import("../proton/types.ts").Session) => Promise<void>,
  dryExtra: Record<string, unknown> = {},
  passRef?: string,
): Promise<void> {
  if (messageIds.length === 0) {
    throw new Error("At least one message ID is required.");
  }
  if (isDryRun()) {
    dryRunPayload(action, messageIds, dryExtra);
    return;
  }
  assertWriteAllowed();
  const runtime = await requireMailRuntime({ passRef });
  await run(runtime.session);
  successPayload(action, messageIds, dryExtra);
}

export async function runMailMove(
  messageIds: string[],
  options: { to: string; from?: string; passRef?: string },
): Promise<void> {
  await runOrganizeAction(
    "move",
    messageIds,
    async (session) => {
      await moveMessages({
        session,
        messageIds,
        toLabel: options.to,
        fromLabel: options.from,
      });
    },
    { to: options.to, from: options.from },
    options.passRef,
  );
}

export async function runMailLabel(
  messageIds: string[],
  options: { label: string; passRef?: string },
): Promise<void> {
  await runOrganizeAction(
    "label",
    messageIds,
    async (session) => {
      await applyLabel({ session, messageIds, label: options.label });
    },
    { label: options.label },
    options.passRef,
  );
}

export async function runMailUnlabel(
  messageIds: string[],
  options: { label: string; passRef?: string },
): Promise<void> {
  await runOrganizeAction(
    "unlabel",
    messageIds,
    async (session) => {
      await removeLabel({ session, messageIds, label: options.label });
    },
    { label: options.label },
    options.passRef,
  );
}

export async function runMailStar(
  messageIds: string[],
  options: { passRef?: string },
): Promise<void> {
  await runOrganizeAction(
    "star",
    messageIds,
    async (session) => {
      await starMessages({ session, messageIds });
    },
    { labelId: LABEL_STARRED },
    options.passRef,
  );
}

export async function runMailUnstar(
  messageIds: string[],
  options: { passRef?: string },
): Promise<void> {
  await runOrganizeAction(
    "unstar",
    messageIds,
    async (session) => {
      await unstarMessages({ session, messageIds });
    },
    { labelId: LABEL_STARRED },
    options.passRef,
  );
}

export async function runMailRead(
  messageIds: string[],
  options: { passRef?: string },
): Promise<void> {
  await runOrganizeAction(
    "read",
    messageIds,
    async (session) => {
      await readMessages({ session, messageIds });
    },
    {},
    options.passRef,
  );
}

export async function runMailUnread(
  messageIds: string[],
  options: { passRef?: string },
): Promise<void> {
  await runOrganizeAction(
    "unread",
    messageIds,
    async (session) => {
      await unreadMessages({ session, messageIds });
    },
    {},
    options.passRef,
  );
}

export async function runMailTrash(
  messageIds: string[],
  options: { passRef?: string },
): Promise<void> {
  await runOrganizeAction(
    "trash",
    messageIds,
    async (session) => {
      await trashMessages({ session, messageIds });
    },
    { labelId: LABEL_TRASH },
    options.passRef,
  );
}

export async function runMailDelete(
  messageIds: string[],
  options: { passRef?: string },
): Promise<void> {
  if (!isDryRun()) {
    assertYesConfirmed("Permanently delete messages");
  }
  await runOrganizeAction(
    "delete",
    messageIds,
    async (session) => {
      await permanentlyDeleteMessages({ session, messageIds });
    },
    {},
    options.passRef,
  );
}

function registerMessageIdsCommand(
  organize: Command,
  name: string,
  description: string,
  handler: (ids: string[], options: OrganizeActionOptions) => Promise<void>,
  extraOptions?: (cmd: Command) => void,
): void {
  const command = organize
    .command(name)
    .description(description)
    .argument("<ids...>", "Message ID(s)")
    .option("--dry-run", "Print planned action without calling the API");

  extraOptions?.(command);

  command.action(async function (
    this: Command,
    ids: string[],
    options: { to?: string; from?: string; label?: string },
  ) {
    try {
      const globals = this.parent?.parent?.optsWithGlobals() as { pass?: string } | undefined;
      await handler(ids, {
        messageIds: ids,
        passRef: globals?.pass,
        ...options,
      });
    } catch (error) {
      reportCommandError(error);
    }
  });
}

export function registerOrganize(mail: Command): void {
  const organize = mail
    .command("organize")
    .description("Move, label, star, read/unread, trash, or delete messages");

  registerMessageIdsCommand(
    organize,
    "move",
    "Move messages to a label/folder",
    async (ids, options) => {
      if (!options.to) throw new Error("--to is required");
      await runMailMove(ids, {
        to: options.to,
        from: options.from,
        passRef: options.passRef,
      });
    },
    (cmd) => {
      cmd.requiredOption(
        "--to <label>",
        "Target label ID or system name (inbox, archive, trash, …)",
      );
      cmd.option(
        "--from <label>",
        "Source label to remove after move (optional)",
      );
    },
  );

  registerMessageIdsCommand(
    organize,
    "label",
    "Apply a label to messages",
    async (ids, options) => {
      if (!options.label) throw new Error("--label is required");
      await runMailLabel(ids, { label: options.label, passRef: options.passRef });
    },
    (cmd) => {
      cmd.requiredOption("--label <id>", "Label ID or system name");
    },
  );

  registerMessageIdsCommand(
    organize,
    "unlabel",
    "Remove a label from messages",
    async (ids, options) => {
      if (!options.label) throw new Error("--label is required");
      await runMailUnlabel(ids, { label: options.label, passRef: options.passRef });
    },
    (cmd) => {
      cmd.requiredOption("--label <id>", "Label ID or system name");
    },
  );

  registerMessageIdsCommand(organize, "star", "Star messages", async (ids, options) => {
    await runMailStar(ids, { passRef: options.passRef });
  });

  registerMessageIdsCommand(organize, "unstar", "Unstar messages", async (ids, options) => {
    await runMailUnstar(ids, { passRef: options.passRef });
  });

  registerMessageIdsCommand(organize, "read", "Mark messages as read", async (ids, options) => {
    await runMailRead(ids, { passRef: options.passRef });
  });

  registerMessageIdsCommand(organize, "unread", "Mark messages as unread", async (ids, options) => {
    await runMailUnread(ids, { passRef: options.passRef });
  });

  registerMessageIdsCommand(organize, "trash", "Move messages to trash", async (ids, options) => {
    await runMailTrash(ids, { passRef: options.passRef });
  });

  registerMessageIdsCommand(
    organize,
    "delete",
    "Permanently delete messages (requires -y/--yes)",
    async (ids, options) => {
      await runMailDelete(ids, { passRef: options.passRef });
    },
  );
}
