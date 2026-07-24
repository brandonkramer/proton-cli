import type { Transporter } from "nodemailer";
import {
  buildForwardMail,
  buildReplyMail,
  buildSendMail,
  toNodemailerOptions,
  type OutgoingAttachment,
  type OutgoingMailPreview,
  type SendInput,
} from "./compose.ts";
import { sendViaTransport } from "./client.ts";
import type { ParsedMessageHeaders } from "../mime/headers.ts";

export interface DeliverMailOptions {
  dryRun?: boolean;
  transport?: Transporter;
}

export interface DeliverMailResult {
  dryRun: boolean;
  preview: OutgoingMailPreview;
  messageId?: string;
}

export async function deliverMail(
  preview: OutgoingMailPreview,
  options: DeliverMailOptions = {},
): Promise<DeliverMailResult> {
  if (options.dryRun) {
    return { dryRun: true, preview };
  }

  if (!options.transport) {
    throw new Error("SMTP transport is required when dryRun is false.");
  }

  const info = await sendViaTransport(options.transport, toNodemailerOptions(preview));
  return {
    dryRun: false,
    preview,
    messageId: info.messageId || undefined,
  };
}

export async function deliverSend(
  input: SendInput,
  options: DeliverMailOptions = {},
): Promise<DeliverMailResult> {
  return deliverMail(buildSendMail(input), options);
}

export async function deliverReply(
  original: ParsedMessageHeaders,
  input: {
    from: string;
    body?: string;
    subject?: string;
    to?: string[];
    cc?: string[];
    attachments?: OutgoingAttachment[];
  },
  options: DeliverMailOptions = {},
): Promise<DeliverMailResult> {
  return deliverMail(buildReplyMail(original, input), options);
}

export async function deliverForward(
  original: ParsedMessageHeaders,
  input: {
    from: string;
    to: string[];
    body?: string;
    subject?: string;
    cc?: string[];
    attachments?: OutgoingAttachment[];
  },
  options: DeliverMailOptions = {},
): Promise<DeliverMailResult> {
  return deliverMail(buildForwardMail(original, input), options);
}
