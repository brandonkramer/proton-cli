import type { MessageEnvelopeObject } from "imapflow";

export function formatAddresses(
  list: MessageEnvelopeObject["from"] | undefined,
): string[] {
  if (!list?.length) return [];
  return list.map((entry) => {
    const name = entry.name?.trim();
    const address = entry.address?.trim();
    if (name && address) return `${name} <${address}>`;
    return address ?? name ?? "";
  }).filter(Boolean);
}

export function envelopeSubject(envelope: MessageEnvelopeObject | undefined): string | null {
  const subject = envelope?.subject?.trim();
  return subject || null;
}

export function envelopeDate(envelope: MessageEnvelopeObject | undefined): string | null {
  const date = envelope?.date;
  if (!date) return null;
  if (date instanceof Date) return date.toISOString();
  return String(date);
}
