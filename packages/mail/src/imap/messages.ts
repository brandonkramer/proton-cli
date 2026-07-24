import type { ImapFlow } from "imapflow";
import { collectAttachmentParts, type AttachmentPart } from "../mime/attachments.ts";
import { parseMessageSource } from "../mime/parse.ts";
import { CliError } from "../util/errors.ts";
import { MailExitCode } from "../util/exit.ts";
import { formatMessageRef } from "../util/uid.ts";
import { cliErrorFromUnknown } from "../util/exit-map.ts";
import {
  envelopeDate,
  envelopeSubject,
  formatAddresses,
} from "./envelope.ts";
import {
  buildSearchQuery,
  type MessageSearchInput,
} from "./search-query.ts";
import { selectMailbox } from "./client.ts";

export interface MessageSummary {
  ref: string;
  mailbox: string;
  uid: number;
  subject: string | null;
  from: string[];
  to: string[];
  date: string | null;
  flags: string[];
  seen: boolean;
  size: number | null;
}

export interface MessageDetail {
  ref: string;
  mailbox: string;
  uid: number;
  subject: string | null;
  from: string[];
  to: string[];
  cc: string[];
  date: string | null;
  flags: string[];
  seen: boolean;
  text: string | null;
  html: string | null;
  raw?: string;
}

export interface MessageSearchResult {
  mailbox: string;
  query: MessageSearchInput;
  ids: string[];
  uids: number[];
}

export async function listMailboxMessages(
  client: ImapFlow,
  mailbox: string,
  limit: number,
): Promise<MessageSummary[]> {
  const lock = await selectMailbox(client, mailbox);
  try {
    const uids = await client.search({ all: true }, { uid: true });
    if (!uids || uids.length === 0) return [];

    const selected = uids
      .slice()
      .sort((a, b) => b - a)
      .slice(0, Math.max(1, limit));

    const rows = await client.fetchAll(
      selected,
      {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
        size: true,
      },
      { uid: true },
    );

    return rows
      .slice()
      .sort((a, b) => b.uid - a.uid)
      .map((row) => summarizeFetchedMessage(mailbox, row));
  } catch (error) {
    throw cliErrorFromUnknown(error, "messages_list_failed");
  } finally {
    lock.release();
  }
}

export async function readMailboxMessage(
  client: ImapFlow,
  mailbox: string,
  uid: number,
  options: { raw?: boolean } = {},
): Promise<MessageDetail> {
  const lock = await selectMailbox(client, mailbox);
  try {
    const row = await client.fetchOne(
      String(uid),
      {
        uid: true,
        envelope: true,
        flags: true,
        source: true,
      },
      { uid: true },
    );

    if (!row || !row.source) {
      throw new CliError(
        `Message not found: ${formatMessageRef(mailbox, uid)}`,
        "message_not_found",
        MailExitCode.NOT_FOUND,
      );
    }

    const flags = [...(row.flags ?? [])];
    const parsed = await parseMessageSource(row.source);

    const detail: MessageDetail = {
      ref: formatMessageRef(mailbox, uid),
      mailbox,
      uid,
      subject: parsed.subject ?? envelopeSubject(row.envelope),
      from: parsed.from.length ? parsed.from : formatAddresses(row.envelope?.from),
      to: parsed.to.length ? parsed.to : formatAddresses(row.envelope?.to),
      cc: parsed.cc,
      date: parsed.date ?? envelopeDate(row.envelope),
      flags,
      seen: flags.includes("\\Seen"),
      text: parsed.text,
      html: parsed.html,
    };

    if (options.raw) {
      detail.raw = row.source.toString("utf8");
    }

    return detail;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw cliErrorFromUnknown(error, "message_read_failed");
  } finally {
    lock.release();
  }
}

export async function searchMailboxMessages(
  client: ImapFlow,
  mailbox: string,
  input: MessageSearchInput,
): Promise<MessageSearchResult> {
  const query = buildSearchQuery(input);
  const lock = await selectMailbox(client, mailbox);
  try {
    const uids = await client.search(query, { uid: true });
    const matched = Array.isArray(uids) ? uids : [];
    const sorted = matched.slice().sort((a: number, b: number) => b - a);
    return {
      mailbox,
      query: input,
      uids: sorted,
      ids: sorted.map((uid: number) => formatMessageRef(mailbox, uid)),
    };
  } catch (error) {
    throw cliErrorFromUnknown(error, "messages_search_failed");
  } finally {
    lock.release();
  }
}

export async function listMessageAttachments(
  client: ImapFlow,
  mailbox: string,
  uid: number,
): Promise<AttachmentPart[]> {
  const lock = await selectMailbox(client, mailbox);
  try {
    const row = await client.fetchOne(
      String(uid),
      {
        uid: true,
        bodyStructure: true,
      },
      { uid: true },
    );

    if (!row) {
      throw new CliError(
        `Message not found: ${formatMessageRef(mailbox, uid)}`,
        "message_not_found",
        MailExitCode.NOT_FOUND,
      );
    }

    return collectAttachmentParts(row.bodyStructure);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw cliErrorFromUnknown(error, "attachments_list_failed");
  } finally {
    lock.release();
  }
}

export interface DownloadedAttachment {
  part: string;
  filename: string | null;
  contentType: string;
  content: Buffer;
}

export async function downloadMessageAttachment(
  client: ImapFlow,
  mailbox: string,
  uid: number,
  part: string,
): Promise<DownloadedAttachment> {
  const lock = await selectMailbox(client, mailbox);
  try {
    const download = await client.download(String(uid), part, { uid: true });
    const content = await streamToBuffer(download.content);
    return {
      part,
      filename: download.meta.filename ?? null,
      contentType: download.meta.contentType,
      content,
    };
  } catch (error) {
    throw cliErrorFromUnknown(error, "attachment_download_failed");
  } finally {
    lock.release();
  }
}

function summarizeFetchedMessage(
  mailbox: string,
  row: {
    uid: number;
    envelope?: Parameters<typeof envelopeSubject>[0];
    flags?: Set<string>;
    internalDate?: Date | string;
    size?: number;
  },
): MessageSummary {
  const flags = [...(row.flags ?? [])];
  const date =
    row.internalDate instanceof Date
      ? row.internalDate.toISOString()
      : row.internalDate
        ? String(row.internalDate)
        : envelopeDate(row.envelope);

  return {
    ref: formatMessageRef(mailbox, row.uid),
    mailbox,
    uid: row.uid,
    subject: envelopeSubject(row.envelope),
    from: formatAddresses(row.envelope?.from),
    to: formatAddresses(row.envelope?.to),
    date,
    flags,
    seen: flags.includes("\\Seen"),
    size: row.size ?? null,
  };
}

async function streamToBuffer(stream: AsyncIterable<Buffer> | NodeJS.ReadableStream): Promise<Buffer> {
  if (Buffer.isBuffer(stream)) {
    return stream;
  }

  const chunks: Buffer[] = [];
  if (typeof (stream as AsyncIterable<Buffer>)[Symbol.asyncIterator] === "function") {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  return await new Promise((resolve, reject) => {
    const readable = stream as NodeJS.ReadableStream;
    const parts: Buffer[] = [];
    readable.on("data", (chunk) => {
      parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    readable.on("error", reject);
    readable.on("end", () => resolve(Buffer.concat(parts)));
  });
}
