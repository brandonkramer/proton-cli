import { simpleParser, type ParsedMail } from "mailparser";

export interface ParsedMessageBody {
  subject: string | null;
  from: string[];
  to: string[];
  cc: string[];
  date: string | null;
  text: string | null;
  html: string | null;
}

export async function parseMessageSource(source: Buffer): Promise<ParsedMessageBody> {
  const parsed = await simpleParser(source);
  return formatParsedMail(parsed);
}

export function formatParsedMail(parsed: ParsedMail): ParsedMessageBody {
  return {
    subject: parsed.subject?.trim() || null,
    from: formatAddressList(parsed.from),
    to: formatAddressList(parsed.to),
    cc: formatAddressList(parsed.cc),
    date: parsed.date ? parsed.date.toISOString() : null,
    text: normalizeBody(parsed.text),
    html: normalizeBody(parsed.html),
  };
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
