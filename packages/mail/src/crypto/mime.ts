import type { MailRecipient } from "../proton/types.ts";

export const MIME_TEXT_PLAIN = "text/plain";
export const MIME_TEXT_HTML = "text/html";

export type ComposeAction = "send" | "reply" | "reply-all" | "forward";

/** Proton create-draft Action values. */
export const DRAFT_ACTION = {
  REPLY: 0,
  REPLY_ALL: 1,
  FORWARD: 2,
} as const;

export function parseAddressList(values: string[] | undefined): MailRecipient[] {
  if (!values || values.length === 0) return [];
  const out: MailRecipient[] = [];
  for (const raw of values) {
    for (const part of raw.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^(.*?)\s*<([^>]+)>$/);
      if (match) {
        out.push({
          Name: (match[1] ?? "").trim(),
          Address: (match[2] ?? "").trim(),
        });
      } else {
        out.push({ Name: "", Address: trimmed });
      }
    }
  }
  return out;
}

export function ensureReplySubject(subject: string): string {
  const trimmed = subject.trim();
  if (/^re:\s*/i.test(trimmed)) return trimmed;
  return `Re: ${trimmed}`;
}

export function ensureForwardSubject(subject: string): string {
  const trimmed = subject.trim();
  if (/^(fwd|fw):\s*/i.test(trimmed)) return trimmed;
  return `Fwd: ${trimmed}`;
}

export function formatReplyBody(
  originalBody: string,
  sender: MailRecipient,
  time: number,
): string {
  const when = time
    ? new Date(time * 1000).toUTCString()
    : "unknown time";
  const from = sender.Name
    ? `${sender.Name} <${sender.Address}>`
    : sender.Address;
  const quoted = originalBody
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\nOn ${when}, ${from} wrote:\n${quoted}`;
}

export function formatForwardBody(
  originalBody: string,
  meta: {
    subject: string;
    sender: MailRecipient;
    to: MailRecipient[];
    cc: MailRecipient[];
    time: number;
  },
): string {
  const when = meta.time
    ? new Date(meta.time * 1000).toUTCString()
    : "unknown time";
  const from = meta.sender.Name
    ? `${meta.sender.Name} <${meta.sender.Address}>`
    : meta.sender.Address;
  const to = meta.to
    .map((r) => (r.Name ? `${r.Name} <${r.Address}>` : r.Address))
    .join(", ");
  const cc = meta.cc
    .map((r) => (r.Name ? `${r.Name} <${r.Address}>` : r.Address))
    .join(", ");
  const lines = [
    "",
    "",
    "---------- Forwarded message ----------",
    `From: ${from}`,
    `Date: ${when}`,
    `Subject: ${meta.subject}`,
    `To: ${to}`,
  ];
  if (cc) lines.push(`Cc: ${cc}`);
  lines.push("", originalBody);
  return lines.join("\n");
}

export function draftActionFor(action: ComposeAction): number | undefined {
  switch (action) {
    case "reply":
      return DRAFT_ACTION.REPLY;
    case "reply-all":
      return DRAFT_ACTION.REPLY_ALL;
    case "forward":
      return DRAFT_ACTION.FORWARD;
    default:
      return undefined;
  }
}
