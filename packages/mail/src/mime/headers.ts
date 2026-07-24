import { simpleParser, type ParsedMail } from "mailparser";

export interface ParsedMessageHeaders {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  subject: string | null;
  from: string[];
  to: string[];
  cc: string[];
  date: string | null;
  text: string | null;
  html: string | null;
}

export async function parseMessageHeaders(source: Buffer): Promise<ParsedMessageHeaders> {
  const parsed = await simpleParser(source);
  return formatParsedHeaders(parsed);
}

export function formatParsedHeaders(parsed: ParsedMail): ParsedMessageHeaders {
  return {
    messageId: normalizeMessageId(parsed.messageId),
    inReplyTo: normalizeMessageId(parsed.inReplyTo),
    references: parseReferences(parsed.references),
    subject: parsed.subject?.trim() || null,
    from: formatAddressList(parsed.from),
    to: formatAddressList(parsed.to),
    cc: formatAddressList(parsed.cc),
    date: parsed.date ? parsed.date.toISOString() : null,
    text: normalizeBody(parsed.text),
    html: normalizeBody(parsed.html),
  };
}

export function replySubject(subject: string | null): string {
  const base = subject?.trim() || "(no subject)";
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}

export function forwardSubject(subject: string | null): string {
  const base = subject?.trim() || "(no subject)";
  return /^fwd:/i.test(base) ? base : `Fwd: ${base}`;
}

export function buildReferences(
  messageId: string | null,
  inReplyTo: string | null,
  references: string[],
): string | undefined {
  const chain = [...references];
  if (inReplyTo && !chain.includes(inReplyTo)) {
    chain.push(inReplyTo);
  }
  if (messageId && !chain.includes(messageId)) {
    chain.push(messageId);
  }
  return chain.length > 0 ? chain.join(" ") : undefined;
}

function normalizeMessageId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseReferences(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    return value
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => parseReferences(entry))
      .filter(Boolean);
  }
  return [];
}

function normalizeBody(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (Buffer.isBuffer(value)) {
    const trimmed = value.toString("utf8").trim();
    return trimmed || null;
  }
  return null;
}

function formatAddressList(
  value: ParsedMail["from"] | ParsedMail["to"] | ParsedMail["cc"],
): string[] {
  if (!value) return [];

  if (typeof value === "object" && "value" in value && Array.isArray(value.value)) {
    return value.value
      .map((entry: { name?: string; address?: string }) => formatAddressEntry(entry))
      .filter(Boolean);
  }

  const list = Array.isArray(value) ? value : [value];
  return list
    .map((entry) => formatAddressEntry(entry))
    .filter(Boolean);
}

function formatAddressEntry(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const record = entry as { name?: string; address?: string };
    const name = record.name?.trim();
    const address = record.address?.trim();
    if (name && address) return `${name} <${address}>`;
    return address ?? name ?? "";
  }
  return "";
}
