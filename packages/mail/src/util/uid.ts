import { CliError } from "./errors.ts";
import { MailExitCode } from "./exit.ts";

export interface MessageRef {
  mailbox: string;
  uid: number;
}

const MESSAGE_REF_PATTERN = /^(.+)::([1-9]\d*)$/;

export function formatMessageRef(mailbox: string, uid: number): string {
  const trimmed = mailbox.trim();
  if (!trimmed) {
    throw new CliError("Mailbox name is required.", "invalid_message_ref", MailExitCode.USER);
  }
  if (!Number.isInteger(uid) || uid < 1) {
    throw new CliError(
      "Message UID must be a positive integer.",
      "invalid_message_ref",
      MailExitCode.USER,
    );
  }
  return `${trimmed}::${uid}`;
}

export function parseMessageRef(input: string): MessageRef {
  const trimmed = input.trim();
  if (!trimmed) {
    throw invalidRefError("Message reference is empty.");
  }

  const match = MESSAGE_REF_PATTERN.exec(trimmed);
  if (!match) {
    throw invalidRefError(
      `Invalid message reference "${trimmed}". Expected Mailbox::uid (e.g. INBOX::25642).`,
    );
  }

  const mailbox = match[1]!.trim();
  if (!mailbox) {
    throw invalidRefError("Mailbox name is missing in message reference.");
  }

  const uid = Number(match[2]!);
  return { mailbox, uid };
}

function invalidRefError(message: string): CliError {
  return new CliError(message, "invalid_message_ref", MailExitCode.USER);
}
