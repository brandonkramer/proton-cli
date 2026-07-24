import {
  ADDRESSES_PATH,
  DEFAULT_PAGE_SIZE,
  LABEL_INBOX,
  LABELS_PATH,
  LABEL_TYPE_FOLDER,
  LABEL_TYPE_LABEL,
  MAIL_MESSAGES_DELETE_PATH,
  MAIL_MESSAGES_LABEL_PATH,
  MAIL_MESSAGES_PATH,
  MAIL_MESSAGES_READ_PATH,
  MAIL_MESSAGES_UNLABEL_PATH,
  MAIL_MESSAGES_UNREAD_PATH,
} from "./constants.ts";
import { mailApi } from "./api.ts";
import { CliError } from "../util/errors.ts";
import type {
  AddressesResponse,
  CreateDraftRequest,
  CreateLabelRequest,
  LabelMessagesRequest,
  LabelResponse,
  LabelsResponse,
  Message,
  MessageActionRequest,
  MessageMetadata,
  MessageQuery,
  MessageResponse,
  MessagesListResponse,
  ProtonLabel,
  SendPackagesRequest,
  Session,
  UpdateLabelRequest,
} from "./types.ts";
import type { ProtonAddress } from "../crypto/unlock.ts";

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

const MAX_MESSAGE_ACTION_IDS = 1000;

function chunkIds(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += MAX_MESSAGE_ACTION_IDS) {
    chunks.push(ids.slice(i, i + MAX_MESSAGE_ACTION_IDS));
  }
  return chunks;
}

async function messageAction(
  path: string,
  ids: string[],
  options: MailClientOptions,
): Promise<void> {
  if (ids.length === 0) {
    throw new CliError("At least one message ID is required.");
  }
  for (const chunk of chunkIds(ids)) {
    await mailApi<{ Code?: number }>(path, {
      method: "PUT",
      body: { IDs: chunk } satisfies MessageActionRequest,
      session: options.session,
      fetchImpl: options.fetchImpl,
    });
  }
}

async function labelAction(
  path: string,
  labelId: string,
  ids: string[],
  options: MailClientOptions,
): Promise<void> {
  if (ids.length === 0) {
    throw new CliError("At least one message ID is required.");
  }
  for (const chunk of chunkIds(ids)) {
    await mailApi<{ Code?: number }>(path, {
      method: "PUT",
      body: { LabelID: labelId, IDs: chunk } satisfies LabelMessagesRequest,
      session: options.session,
      fetchImpl: options.fetchImpl,
    });
  }
}

/** Apply a label to messages (move/star/folder). */
export async function labelMessages(
  options: MailClientOptions & { labelId: string; messageIds: string[] },
): Promise<void> {
  await labelAction(
    MAIL_MESSAGES_LABEL_PATH,
    options.labelId,
    options.messageIds,
    options,
  );
}

/** Remove a label from messages. */
export async function unlabelMessages(
  options: MailClientOptions & { labelId: string; messageIds: string[] },
): Promise<void> {
  await labelAction(
    MAIL_MESSAGES_UNLABEL_PATH,
    options.labelId,
    options.messageIds,
    options,
  );
}

/** Mark messages as read. */
export async function markMessagesRead(
  options: MailClientOptions & { messageIds: string[] },
): Promise<void> {
  await messageAction(MAIL_MESSAGES_READ_PATH, options.messageIds, options);
}

/** Mark messages as unread. */
export async function markMessagesUnread(
  options: MailClientOptions & { messageIds: string[] },
): Promise<void> {
  await messageAction(MAIL_MESSAGES_UNREAD_PATH, options.messageIds, options);
}

/** Permanently delete messages. */
export async function deleteMessages(
  options: MailClientOptions & { messageIds: string[] },
): Promise<void> {
  await messageAction(MAIL_MESSAGES_DELETE_PATH, options.messageIds, options);
}

/** Create an encrypted draft (POST /mail/v4/messages). */
export async function createDraft(
  options: MailClientOptions & { draft: CreateDraftRequest },
): Promise<Message> {
  const data = await mailApi<MessageResponse>(MAIL_MESSAGES_PATH, {
    method: "POST",
    body: options.draft,
    session: options.session,
    fetchImpl: options.fetchImpl,
  });

  if (!data.Message?.ID) {
    throw new CliError("Create draft failed: no Message.ID in response.");
  }
  return data.Message;
}

/** Send packages for a draft (POST /mail/v4/messages/{id}). */
export async function sendPackages(
  options: MailClientOptions & {
    messageId: string;
    request: SendPackagesRequest;
  },
): Promise<Message | undefined> {
  const data = await mailApi<MessageResponse>(
    `${MAIL_MESSAGES_PATH}/${options.messageId}`,
    {
      method: "POST",
      body: options.request,
      session: options.session,
      fetchImpl: options.fetchImpl,
    },
  );
  return data.Message;
}

export interface LabelSummary {
  id: string;
  name: string;
  color: string;
  type: number;
  parentId: string;
  path: string[];
}

function mapLabel(label: ProtonLabel): LabelSummary {
  const path =
    typeof label.Path === "string"
      ? label.Path.split("/").filter(Boolean)
      : (label.Path ?? []);
  return {
    id: label.ID,
    name: label.Name,
    color: label.Color,
    type: label.Type,
    parentId: label.ParentID ?? "",
    path,
  };
}

/** List user labels (Type=1) and/or folders (Type=3). */
export async function listLabels(
  options: MailClientOptions & { types?: number[] },
): Promise<LabelSummary[]> {
  const types = options.types ?? [LABEL_TYPE_LABEL, LABEL_TYPE_FOLDER];
  const labels: LabelSummary[] = [];
  for (const type of types) {
    const data = await mailApi<LabelsResponse>(
      `${LABELS_PATH}?Type=${type}`,
      {
        session: options.session,
        fetchImpl: options.fetchImpl,
      },
    );
    for (const label of data.Labels ?? []) {
      labels.push(mapLabel(label));
    }
  }
  return labels;
}

/** Create a label or folder. */
export async function createLabel(
  options: MailClientOptions & { request: CreateLabelRequest },
): Promise<LabelSummary> {
  const data = await mailApi<LabelResponse>(LABELS_PATH, {
    method: "POST",
    body: options.request,
    session: options.session,
    fetchImpl: options.fetchImpl,
  });
  if (!data.Label) {
    throw new CliError("Failed to create label.");
  }
  return mapLabel(data.Label);
}

/** Update a label or folder. */
export async function updateLabel(
  options: MailClientOptions & { labelId: string; request: UpdateLabelRequest },
): Promise<LabelSummary> {
  const data = await mailApi<LabelResponse>(`${LABELS_PATH}/${options.labelId}`, {
    method: "PUT",
    body: options.request,
    session: options.session,
    fetchImpl: options.fetchImpl,
  });
  if (!data.Label) {
    throw new CliError(`Failed to update label: ${options.labelId}`);
  }
  return mapLabel(data.Label);
}

/** Delete a label or folder. */
export async function deleteLabel(
  options: MailClientOptions & { labelId: string },
): Promise<void> {
  await mailApi<{ Code?: number }>(`${LABELS_PATH}/${options.labelId}`, {
    method: "DELETE",
    session: options.session,
    fetchImpl: options.fetchImpl,
  });
}

/** List account mail addresses. */
export async function listAddresses(
  options: MailClientOptions,
): Promise<ProtonAddress[]> {
  const data = await mailApi<AddressesResponse>(ADDRESSES_PATH, {
    session: options.session,
    fetchImpl: options.fetchImpl,
  });
  return data.Addresses ?? [];
}

export type { Message, MessageMetadata };
