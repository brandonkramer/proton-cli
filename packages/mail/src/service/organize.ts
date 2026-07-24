import {
  LABEL_STARRED,
  LABEL_TRASH,
  resolveLabelId,
} from "../proton/constants.ts";
import {
  deleteMessages,
  labelMessages,
  markMessagesRead,
  markMessagesUnread,
  unlabelMessages,
} from "../proton/client.ts";
import type { Session } from "../proton/types.ts";

export interface OrganizeServiceOptions {
  session: Session;
  fetchImpl?: typeof fetch;
  messageIds: string[];
}

export interface MoveMessagesOptions extends OrganizeServiceOptions {
  toLabel: string;
  fromLabel?: string;
}

/** Label messages with a folder/label (optionally unlabel source). */
export async function moveMessages(options: MoveMessagesOptions): Promise<void> {
  const toLabelId = resolveLabelId(options.toLabel);
  await labelMessages({
    session: options.session,
    fetchImpl: options.fetchImpl,
    labelId: toLabelId,
    messageIds: options.messageIds,
  });
  if (options.fromLabel) {
    await unlabelMessages({
      session: options.session,
      fetchImpl: options.fetchImpl,
      labelId: resolveLabelId(options.fromLabel),
      messageIds: options.messageIds,
    });
  }
}

export async function applyLabel(
  options: OrganizeServiceOptions & { label: string },
): Promise<void> {
  await labelMessages({
    session: options.session,
    fetchImpl: options.fetchImpl,
    labelId: resolveLabelId(options.label),
    messageIds: options.messageIds,
  });
}

export async function removeLabel(
  options: OrganizeServiceOptions & { label: string },
): Promise<void> {
  await unlabelMessages({
    session: options.session,
    fetchImpl: options.fetchImpl,
    labelId: resolveLabelId(options.label),
    messageIds: options.messageIds,
  });
}

export async function starMessages(options: OrganizeServiceOptions): Promise<void> {
  await labelMessages({
    session: options.session,
    fetchImpl: options.fetchImpl,
    labelId: LABEL_STARRED,
    messageIds: options.messageIds,
  });
}

export async function unstarMessages(options: OrganizeServiceOptions): Promise<void> {
  await unlabelMessages({
    session: options.session,
    fetchImpl: options.fetchImpl,
    labelId: LABEL_STARRED,
    messageIds: options.messageIds,
  });
}

export async function trashMessages(options: OrganizeServiceOptions): Promise<void> {
  await labelMessages({
    session: options.session,
    fetchImpl: options.fetchImpl,
    labelId: LABEL_TRASH,
    messageIds: options.messageIds,
  });
}

export async function readMessages(options: OrganizeServiceOptions): Promise<void> {
  await markMessagesRead({
    session: options.session,
    fetchImpl: options.fetchImpl,
    messageIds: options.messageIds,
  });
}

export async function unreadMessages(options: OrganizeServiceOptions): Promise<void> {
  await markMessagesUnread({
    session: options.session,
    fetchImpl: options.fetchImpl,
    messageIds: options.messageIds,
  });
}

export async function permanentlyDeleteMessages(
  options: OrganizeServiceOptions,
): Promise<void> {
  await deleteMessages({
    session: options.session,
    fetchImpl: options.fetchImpl,
    messageIds: options.messageIds,
  });
}
