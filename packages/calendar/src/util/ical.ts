import { createHash } from "node:crypto";

export interface Attendee {
  email: string;
  token: string;
}

function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Escape TEXT values in iCalendar (RFC 5545). */
export function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Unescape TEXT values in iCalendar. */
export function unescapeIcalText(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "\\" && i + 1 < value.length) {
      const next = value[i + 1]!;
      if (next === "n" || next === "N") {
        out += "\n";
      } else if (next === "," || next === ";" || next === "\\") {
        out += next;
      } else {
        out += next;
      }
      i += 1;
      continue;
    }
    out += value[i];
  }
  return out;
}

export function icalField(text: string, name: string): string {
  const prefix = `${name}:`;
  const prefixParam = `${name};`;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) {
      return unescapeIcalText(trimmed.slice(prefix.length));
    }
    if (trimmed.startsWith(prefixParam)) {
      const colon = trimmed.indexOf(":");
      if (colon >= 0) return unescapeIcalText(trimmed.slice(colon + 1));
    }
    if (trimmed.includes(`.${name};`) || trimmed.includes(`.${name}:`)) {
      const colon = trimmed.indexOf(":");
      if (colon >= 0) return unescapeIcalText(trimmed.slice(colon + 1));
    }
  }
  return "";
}

export function eventUid(): string {
  return `${Date.now()}@proton-cli`;
}

export function attendeeToken(uid: string, email: string): string {
  return createHash("sha1").update(uid + canonicalEmail(email)).digest("hex");
}

function eventDates(
  start: Date,
  end: Date,
  allDay: boolean,
): { dtstart: string; dtend: string } {
  if (allDay) {
    const fmt = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return {
      dtstart: `DTSTART;VALUE=DATE:${fmt(start)}`,
      dtend: `DTEND;VALUE=DATE:${fmt(end)}`,
    };
  }
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}T${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}${String(d.getUTCSeconds()).padStart(2, "0")}Z`;
  return { dtstart: `DTSTART:${fmt(start)}`, dtend: `DTEND:${fmt(end)}` };
}

function attendeeLine(attendee: Attendee): string {
  const cn = escapeIcalText(attendee.email);
  return `ATTENDEE;CN=${cn};ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;X-PM-TOKEN=${attendee.token}:mailto:${attendee.email}`;
}

export function signedVevent(options: {
  uid: string;
  start: Date;
  end: Date;
  allDay: boolean;
  sequence?: number;
  rrule?: string;
  organizer?: string;
}): string {
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const { dtstart, dtend } = eventDates(options.start, options.end, options.allDay);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//proton-cli//EN",
    "BEGIN:VEVENT",
    `UID:${options.uid}`,
    `DTSTAMP:${dtstamp}`,
    dtstart,
    dtend,
  ];
  if (options.organizer) {
    const cn = escapeIcalText(options.organizer);
    lines.push(`ORGANIZER;CN=${cn}:mailto:${options.organizer}`);
  }
  if (options.rrule) {
    lines.push(`RRULE:${options.rrule}`);
  }
  lines.push(`SEQUENCE:${options.sequence ?? 0}`, "END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

export function encryptedVevent(
  title: string,
  location: string,
  description: string,
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//proton-cli//EN",
    "BEGIN:VEVENT",
    `SUMMARY:${escapeIcalText(title)}`,
  ];
  if (location) lines.push(`LOCATION:${escapeIcalText(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeIcalText(description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

export function attendeesVevent(uid: string, attendees: Attendee[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//proton-cli//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
  ];
  for (const attendee of attendees) {
    lines.push(attendeeLine(attendee));
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

/** Convert reminder duration (`15m`, `1h`, `1d`) to iCal trigger (`-PT15M`, etc.). */
export function icalTrigger(durationMs: number): string {
  const day = 86_400_000;
  const hour = 3_600_000;
  const minute = 60_000;
  if (durationMs % day === 0) {
    return `-P${durationMs / day}D`;
  }
  if (durationMs % hour === 0) {
    return `-PT${durationMs / hour}H`;
  }
  return `-PT${Math.round(durationMs / minute)}M`;
}

export function parseTime(input: string): Date {
  const formats = [
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    /^\d{4}-\d{2}-\d{2}$/,
  ];
  const trimmed = input.trim();
  for (const pattern of formats) {
    if (!pattern.test(trimmed)) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split("-").map(Number);
      return new Date(y!, m! - 1, d!, 0, 0, 0, 0);
    }
    const normalized = trimmed.includes(" ") ? trimmed.replace(" ", "T") : trimmed;
    const withZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(normalized)
      ? normalized
      : `${normalized}:00`;
    const parsed = new Date(withZone);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw new Error(`Unrecognized time format: ${input}`);
}

export function parseDateOnly(input: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid date: ${input}`);
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
}
