import {
  DEFAULT_PAGE_SIZE,
  LABEL_INBOX,
  resolveLabelId,
} from "../proton/constants.ts";
import {
  getMessage,
  listMessages,
  searchMessages as searchMessagesApi,
  type MessageMetadata,
} from "../proton/client.ts";
import type { Session } from "../proton/types.ts";
import { decryptMessageBody } from "../crypto/decrypt.ts";
import {
  unlockMailKeys,
  type UnlockedAddressKey,
} from "../crypto/unlock.ts";
import { CliError } from "../util/errors.ts";

export interface MessageSummary {
  id: string;
  conversationId: string;
  subject: string;
  /** Sender email address. */
  sender: string;
  senderName: string;
  senderEmail: string;
  to: string[];
  cc: string[];
  /** Unix seconds. */
  time: number;
  unread: boolean;
  labelIds: string[];
  numAttachments: number;
}

export interface DecryptedMessage extends MessageSummary {
  body: string;
  mimeType: string;
}

export interface MessagesPageResult {
  labelId: string;
  page: number;
  pageSize: number;
  total: number;
  messages: MessageSummary[];
}

export interface MessageServiceOptions {
  session: Session;
  fetchImpl?: typeof fetch;
  addressKeys?: Map<string, UnlockedAddressKey>;
}

export interface ListMessagesForCommandOptions extends MessageServiceOptions {
  labelId?: string;
  page?: number;
  pageSize?: number;
  unread?: boolean;
}

export interface SearchMessagesForCommandOptions extends MessageServiceOptions {
  /** Alias for keyword (CLI search query). */
  query?: string;
  keyword?: string;
  from?: string;
  to?: string;
  subject?: string;
  labelId?: string;
  page?: number;
  pageSize?: number;
  begin?: number;
  end?: number;
}

function mapRecipientList(
  recipients: MessageMetadata["ToList"] | undefined,
): string[] {
  return (recipients ?? []).map((entry) => entry.Address).filter(Boolean);
}

function mapSummary(meta: MessageMetadata): MessageSummary {
  const senderEmail = meta.Sender?.Address ?? "";
  const senderName = meta.Sender?.Name ?? "";
  return {
    id: meta.ID,
    conversationId: meta.ConversationID,
    subject: meta.Subject,
    sender: senderEmail,
    senderName,
    senderEmail,
    to: mapRecipientList(meta.ToList),
    cc: mapRecipientList(meta.CCList),
    time: meta.Time,
    unread: meta.Unread === 1,
    labelIds: meta.LabelIDs ?? [],
    numAttachments: meta.NumAttachments ?? 0,
  };
}

/** List inbox (or label) metadata for CLI display — no body decrypt. */
export async function listMessagesForCommand(
  options: ListMessagesForCommandOptions,
): Promise<MessagesPageResult> {
  const labelId = resolveLabelId(options.labelId ?? LABEL_INBOX);
  const page = options.page ?? 0;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const result = await listMessages({
    session: options.session,
    fetchImpl: options.fetchImpl,
    labelId,
    page,
    pageSize,
    unread: options.unread,
  });
  return {
    labelId,
    page,
    pageSize,
    total: result.total,
    messages: result.messages.map(mapSummary),
  };
}

/** Server-side metadata search for CLI display. */
export async function searchMessages(
  options: SearchMessagesForCommandOptions,
): Promise<MessagesPageResult> {
  const labelId = resolveLabelId(options.labelId ?? LABEL_INBOX);
  const page = options.page ?? 0;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const result = await searchMessagesApi({
    session: options.session,
    fetchImpl: options.fetchImpl,
    labelId,
    page,
    pageSize,
    keyword: options.keyword ?? options.query,
    from: options.from,
    to: options.to,
    subject: options.subject,
    begin: options.begin,
    end: options.end,
  });
  return {
    labelId,
    page,
    pageSize,
    total: result.total,
    messages: result.messages.map(mapSummary),
  };
}

/** Fetch one message and decrypt its body when address keys / password available. */
export async function getAndDecryptMessage(
  options: MessageServiceOptions & {
    messageId: string;
    password?: string;
  },
): Promise<DecryptedMessage> {
  let addressKeys = options.addressKeys;
  if ((!addressKeys || addressKeys.size === 0) && options.password) {
    const unlocked = await unlockMailKeys(
      options.session,
      options.password,
      options.fetchImpl,
    );
    addressKeys = unlocked.addressKeys;
  }

  const message = await getMessage({
    session: options.session,
    fetchImpl: options.fetchImpl,
    messageId: options.messageId,
  });

  const summary = mapSummary(message);
  let body = message.Body;

  if (addressKeys && addressKeys.size > 0) {
    const decrypted = await decryptMessageBody({
      armoredBody: message.Body,
      addressKeys,
      addressId: message.AddressID,
      senderEmail: message.Sender?.Address,
      session: options.session,
      fetchImpl: options.fetchImpl,
    });
    body = decrypted.plaintext;
  } else if (message.Body.includes("-----BEGIN PGP MESSAGE-----")) {
    throw new CliError(
      "Message body is encrypted. Pass the account password (--pass) to decrypt.",
    );
  }

  return {
    ...summary,
    body,
    mimeType: message.MIMEType ?? "text/plain",
  };
}

export { mapSummary };
