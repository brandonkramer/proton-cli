/** Proton contact card types. */
export const CardClear = 0;
export const CardEncrypted = 1;
export const CardSigned = 2;
export const CardEncryptedSigned = 3;

export interface ContactCard {
  Type: number;
  Data: string;
  Signature?: string;
}

export interface VCardFields {
  phones: string[];
  note: string;
  org: string;
  title: string;
  birthday: string;
  address: string;
  url: string;
}

export interface SignedEmail {
  address: string;
  keyValues: string[];
  encrypt?: boolean;
  sign?: boolean;
  scheme?: string;
}

export interface SignedContact {
  name: string;
  uid: string;
  emails: SignedEmail[];
}

function groupScopedText(text: string, group: string): string {
  return text
    .split("\n")
    .filter((rawLine) => rawLine.trim().startsWith(`${group}.`))
    .join("\n");
}

export function groupVcardField(text: string, group: string, name: string): string {
  return vcardField(groupScopedText(text, group), name);
}

export function groupVcardFields(text: string, group: string, name: string): string[] {
  return vcardFields(groupScopedText(text, group), name);
}

export function findSignedEmail(
  contact: SignedContact,
  email: string,
): SignedEmail | undefined {
  const needle = email.toLowerCase();
  return contact.emails.find((entry) => entry.address.toLowerCase() === needle);
}

export function contactUid(): string {
  return `proton-cli-${Date.now()}`;
}

function boolStr(value: boolean): string {
  return value ? "true" : "false";
}

export function signedVCard(name: string, emails: string[], uid: string): string {
  const lines = ["BEGIN:VCARD", "VERSION:4.0", `FN:${name}`, `UID:${uid}`];
  let index = 0;
  for (const email of emails) {
    if (!email) continue;
    index += 1;
    lines.push(`item${index}.EMAIL;PREF=${index}:${email}`);
  }
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export function buildSignedVCard(contact: SignedContact): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:4.0",
    `FN:${contact.name}`,
    `UID:${contact.uid}`,
  ];
  let index = 0;
  for (const email of contact.emails) {
    if (!email.address) continue;
    index += 1;
    const group = `item${index}`;
    lines.push(`${group}.EMAIL;PREF=${index}:${email.address}`);
    email.keyValues.forEach((keyValue, keyIndex) => {
      lines.push(`${group}.KEY;PREF=${keyIndex + 1}:${keyValue}`);
    });
    if (email.encrypt !== undefined) {
      lines.push(`${group}.X-PM-ENCRYPT:${boolStr(email.encrypt)}`);
    }
    if (email.sign !== undefined) {
      lines.push(`${group}.X-PM-SIGN:${boolStr(email.sign)}`);
    }
    if (email.scheme) {
      lines.push(`${group}.X-PM-SCHEME:${email.scheme}`);
    }
  }
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export function encryptedVCard(fields: VCardFields): string {
  const lines = ["BEGIN:VCARD", "VERSION:4.0"];
  let index = 0;
  for (const phone of fields.phones) {
    if (!phone) continue;
    index += 1;
    lines.push(`TEL;PREF=${index}:${phone}`);
  }
  if (fields.note) lines.push(`NOTE:${fields.note}`);
  if (fields.org) lines.push(`ORG:${fields.org}`);
  if (fields.title) lines.push(`TITLE:${fields.title}`);
  if (fields.birthday) lines.push(`BDAY:${fields.birthday}`);
  if (fields.address) lines.push(`ADR:${fields.address}`);
  if (fields.url) lines.push(`URL:${fields.url}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export function hasEncryptedFields(fields: VCardFields): boolean {
  return (
    fields.phones.some(Boolean) ||
    Boolean(fields.note || fields.org || fields.title || fields.birthday || fields.address || fields.url)
  );
}

export function vcardField(text: string, name: string): string {
  const prefix = `${name}:`;
  const prefixParam = `${name};`;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith(prefix)) {
      return line.slice(prefix.length);
    }
    if (line.startsWith(prefixParam)) {
      const colon = line.indexOf(":");
      if (colon >= 0) return line.slice(colon + 1);
    }
    if (line.includes(`.${name};`) || line.includes(`.${name}:`)) {
      const colon = line.indexOf(":");
      if (colon >= 0) return line.slice(colon + 1);
    }
  }
  return "";
}

export function vcardFields(text: string, name: string): string[] {
  const values: string[] = [];
  const prefix = `${name}:`;
  const prefixParam = `${name};`;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith(prefix)) {
      values.push(line.slice(prefix.length));
    } else if (line.startsWith(prefixParam)) {
      const colon = line.indexOf(":");
      if (colon >= 0) values.push(line.slice(colon + 1));
    } else if (line.includes(`.${name};`) || line.includes(`.${name}:`)) {
      const colon = line.indexOf(":");
      if (colon >= 0) values.push(line.slice(colon + 1));
    }
  }
  return values;
}

export function parseSignedVCard(text: string): SignedContact {
  const contact: SignedContact = {
    name: vcardField(text, "FN"),
    uid: vcardField(text, "UID"),
    emails: [],
  };
  const seenGroups = new Set<string>();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const match = /^item(\d+)\.EMAIL(?:;[^:]*)?:(.+)$/.exec(line);
    if (!match) continue;
    const group = `item${match[1]}`;
    if (seenGroups.has(group)) continue;
    seenGroups.add(group);
    const encryptRaw = groupVcardField(text, group, "X-PM-ENCRYPT");
    const signRaw = groupVcardField(text, group, "X-PM-SIGN");
    contact.emails.push({
      address: match[2] ?? "",
      keyValues: groupVcardFields(text, group, "KEY"),
      scheme: groupVcardField(text, group, "X-PM-SCHEME") || undefined,
      encrypt:
        encryptRaw === ""
          ? undefined
          : encryptRaw.toLowerCase() === "true",
      sign: signRaw === "" ? undefined : signRaw.toLowerCase() === "true",
    });
  }
  return contact;
}

export function contactFromCards(id: string, cards: string[]): {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  emails: string[];
  phones: string[];
  org: string;
  note: string;
  title: string;
  birthday: string;
  address: string;
  url: string;
} {
  const joined = cards.join("\n");
  const emails = vcardFields(joined, "EMAIL");
  const phones = vcardFields(joined, "TEL");
  return {
    id,
    name: vcardField(joined, "FN"),
    emails,
    phones,
    email: emails[0],
    phone: phones[0],
    org: vcardField(joined, "ORG"),
    note: vcardField(joined, "NOTE"),
    title: vcardField(joined, "TITLE"),
    birthday: vcardField(joined, "BDAY"),
    address: vcardField(joined, "ADR"),
    url: vcardField(joined, "URL"),
  };
}
