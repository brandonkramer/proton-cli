import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import { toNodemailerOptions, type OutgoingMailPreview } from "../smtp/compose.ts";

/** Build an RFC822 message buffer suitable for IMAP APPEND (e.g. drafts). */
export async function buildRawMailMessage(
  preview: OutgoingMailPreview,
): Promise<Buffer> {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    newline: "windows",
    buffer: true,
  } as SMTPTransport.Options);

  try {
    const info = await transport.sendMail(toNodemailerOptions(preview));
    const message = (info as { message?: Buffer | string }).message;
    if (Buffer.isBuffer(message)) {
      return message;
    }
    if (typeof message === "string") {
      return Buffer.from(message, "utf8");
    }
    throw new Error("Unexpected raw message format from mail composer.");
  } finally {
    transport.close();
  }
}
