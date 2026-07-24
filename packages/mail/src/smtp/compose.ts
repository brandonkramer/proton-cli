import type { Attachment } from "nodemailer/lib/mailer/index.js";
import type { ParsedMessageHeaders } from "../mime/headers.ts";
import {
  buildReferences,
  forwardSubject,
  replySubject,
} from "../mime/headers.ts";

export interface OutgoingAttachment {
  filename: string;
  path?: string;
  content?: Buffer;
  contentType?: string;
}

export interface OutgoingMailPreview {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: OutgoingAttachment[];
}

export interface SendInput {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body?: string;
  html?: string;
  attachments?: OutgoingAttachment[];
  headers?: Record<string, string>;
}

export function buildSendMail(input: SendInput): OutgoingMailPreview {
  return {
    from: input.from,
    to: input.to,
    cc: input.cc?.length ? input.cc : undefined,
    subject: input.subject,
    text: input.body,
    html: input.html,
    headers: input.headers,
    attachments: input.attachments?.length ? input.attachments : undefined,
  };
}

export function buildReplyMail(
  original: ParsedMessageHeaders,
  input: {
    from: string;
    body?: string;
    subject?: string;
    to?: string[];
    cc?: string[];
    attachments?: OutgoingAttachment[];
  },
): OutgoingMailPreview {
  const replyTo = input.to?.length
    ? input.to
    : original.from.length
      ? [original.from[0]!]
      : [];

  const headers: Record<string, string> = {};
  if (original.messageId) {
    headers["In-Reply-To"] = original.messageId;
    const references = buildReferences(
      original.messageId,
      original.inReplyTo,
      original.references,
    );
    if (references) {
      headers.References = references;
    }
  }

  return {
    from: input.from,
    to: replyTo,
    cc: input.cc?.length ? input.cc : undefined,
    subject: input.subject?.trim() || replySubject(original.subject),
    text: input.body,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    attachments: input.attachments?.length ? input.attachments : undefined,
  };
}

export function buildForwardMail(
  original: ParsedMessageHeaders,
  input: {
    from: string;
    to: string[];
    body?: string;
    subject?: string;
    cc?: string[];
    attachments?: OutgoingAttachment[];
  },
): OutgoingMailPreview {
  const forwardedBody = formatForwardedBody(original, input.body);
  return {
    from: input.from,
    to: input.to,
    cc: input.cc?.length ? input.cc : undefined,
    subject: input.subject?.trim() || forwardSubject(original.subject),
    text: forwardedBody,
    attachments: input.attachments?.length ? input.attachments : undefined,
  };
}

export function toNodemailerOptions(
  preview: OutgoingMailPreview,
): {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: Attachment[];
} {
  return {
    from: preview.from,
    to: preview.to.join(", "),
    cc: preview.cc?.length ? preview.cc.join(", ") : undefined,
    subject: preview.subject,
    text: preview.text,
    html: preview.html,
    headers: preview.headers,
    attachments: preview.attachments?.map((attachment) => ({
      filename: attachment.filename,
      path: attachment.path,
      content: attachment.content,
      contentType: attachment.contentType,
    })),
  };
}

function formatForwardedBody(
  original: ParsedMessageHeaders,
  note?: string,
): string {
  const headerLines = [
    "---------- Forwarded message ----------",
    original.from.length ? `From: ${original.from.join(", ")}` : undefined,
    original.date ? `Date: ${original.date}` : undefined,
    original.subject ? `Subject: ${original.subject}` : undefined,
    original.to.length ? `To: ${original.to.join(", ")}` : undefined,
    original.cc.length ? `Cc: ${original.cc.join(", ")}` : undefined,
  ].filter(Boolean);

  const originalBody = original.text ?? stripHtml(original.html) ?? "(no body)";
  const parts = [
    note?.trim() ? `${note.trim()}\n` : undefined,
    headerLines.join("\n"),
    "",
    originalBody,
  ].filter((part) => part !== undefined);

  return parts.join("\n");
}

function stripHtml(html: string | null): string | null {
  if (!html) return null;
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text || null;
}
