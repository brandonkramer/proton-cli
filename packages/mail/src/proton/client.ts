import {
  DEFAULT_PAGE_SIZE,
  LABEL_INBOX,
  MAIL_MESSAGES_PATH,
} from "./constants.ts";
import { mailApi } from "./api.ts";
import { CliError } from "../util/errors.ts";
import type {
  Message,
  MessageMetadata,
  MessageQuery,
  MessageResponse,
  MessagesListResponse,
  Session,
} from "./types.ts";

export interface MailClientOptions {
  session: Session;
  fetchImpl?: typeof fetch;
}

export interface ListMessagesOptions extends MailClientOptions {
  labelId?: string;
  page?: number;
  pageSize?: number;
  addressId?: string;
  unread?: boolean;
  sort?: string;
  desc?: boolean;
}

export interface SearchMessagesOptions extends ListMessagesOptions {
  keyword?: string;
  from?: string;
  to?: string;
  subject?: string;
  begin?: number;
  end?: number;
}

export interface MessagesPage {
  messages: MessageMetadata[];
  total: number;
}

function queryBody(
  options: ListMessagesOptions & SearchMessagesOptions,
): MessageQuery {
  const body: MessageQuery = {
    Page: options.page ?? 0,
    PageSize: options.pageSize ?? DEFAULT_PAGE_SIZE,
    LabelID: options.labelId ?? LABEL_INBOX,
    Sort: options.sort ?? "Time",
    Desc: options.desc === false ? 0 : 1,
  };

  if (options.addressId) body.AddressID = options.addressId;
  if (options.unread !== undefined) body.Unread = options.unread ? 1 : 0;
  if (options.keyword) body.Keyword = options.keyword;
  if (options.from) body.From = options.from;
  if (options.to) body.Recipients = options.to;
  if (options.subject) body.Subject = options.subject;
  if (options.begin !== undefined) body.Begin = options.begin;
  if (options.end !== undefined) body.End = options.end;

  return body;
}

async function fetchMessagesPage(
  options: ListMessagesOptions & SearchMessagesOptions,
): Promise<MessagesPage> {
  const data = await mailApi<MessagesListResponse>(MAIL_MESSAGES_PATH, {
    method: "POST",
    headers: { "X-HTTP-Method-Override": "GET" },
    body: queryBody(options),
    session: options.session,
    fetchImpl: options.fetchImpl,
  });

  return {
    messages: data.Messages ?? [],
    total: data.Total ?? (data.Messages ?? []).length,
  };
}

/** List message metadata (POST + X-HTTP-Method-Override: GET). */
export async function listMessages(
  options: ListMessagesOptions,
): Promise<MessagesPage> {
  return fetchMessagesPage(options);
}

/** Server-side metadata search (Keyword, From, Subject, etc.). */
export async function searchMessages(
  options: SearchMessagesOptions,
): Promise<MessagesPage> {
  return fetchMessagesPage(options);
}

/** Fetch a single message including encrypted body. */
export async function getMessage(
  options: MailClientOptions & { messageId: string },
): Promise<Message> {
  const data = await mailApi<MessageResponse>(
    `${MAIL_MESSAGES_PATH}/${options.messageId}`,
    {
      session: options.session,
      fetchImpl: options.fetchImpl,
    },
  );

  if (!data.Message) {
    throw new CliError(`Message not found: ${options.messageId}`);
  }

  return data.Message;
}

export type { Message, MessageMetadata };
