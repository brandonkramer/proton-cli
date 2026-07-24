import { unlockCalendarForEvents } from "../crypto/calendar-unlock.ts";
import {
  cardFromRaw,
  decryptCards,
  encryptAndSignCardSplit,
  encryptPartWithSessionKey,
  encryptSessionKeyForRecipient,
} from "../crypto/event-card.ts";
import type { EventCard } from "../crypto/types.ts";
import { calendarApi } from "../proton/api.ts";
import { KEYS_ALL_PATH } from "../proton/constants.ts";
import type { Session } from "../proton/types.ts";
import { parseDuration } from "../util/duration.ts";
import {
  attendeeToken,
  attendeesVevent,
  encryptedVevent,
  icalField,
  icalTrigger,
  signedVevent,
} from "../util/ical.ts";
import { getCalendarCrypto } from "../crypto/proxy.ts";
import { listCalendars, resolveCalendarId } from "./calendars.ts";

export interface EventSummary {
  id: string;
  calendarId: string;
  title: string;
  location: string;
  description: string;
  rrule: string;
  start: string;
  end: string;
  allDay: boolean;
  uid: string;
}

export interface EventInput {
  title: string;
  location?: string;
  description?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  rrule?: string;
  reminders?: string[];
  attendees?: string[];
}

export interface CreateEventResult {
  id: string;
  externalAttendees?: string[];
}

export interface EventServiceOptions {
  session: Session;
  fetchImpl?: typeof fetch;
}

interface RawEvent {
  ID: string;
  CalendarID: string;
  StartTime: number;
  EndTime: number;
  FullDay: number;
  UID: string;
  SharedKeyPacket: string;
  SharedEvents?: Record<string, unknown>[];
}

function defaultRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 30);
  return { start, end };
}

function mapCards(raw: Record<string, unknown>[] | undefined): EventCard[] {
  return (raw ?? []).map((entry) => cardFromRaw(entry));
}

async function decryptEventFields(
  raw: RawEvent,
  calendarPrivateKey: unknown,
  addressPublicKey: unknown,
): Promise<{
  title: string;
  location: string;
  description: string;
  rrule: string;
  organizer: string;
}> {
  const cards = mapCards(raw.SharedEvents);
  const decrypted = await decryptCards(
    cards,
    calendarPrivateKey,
    addressPublicKey,
    raw.SharedKeyPacket,
  );
  const joined = decrypted.join("\n");
  const organizer = icalField(joined, "ORGANIZER").replace(/^mailto:/i, "");
  return {
    title: icalField(joined, "SUMMARY"),
    location: icalField(joined, "LOCATION"),
    description: icalField(joined, "DESCRIPTION"),
    rrule: icalField(joined, "RRULE"),
    organizer,
  };
}

function mapEvent(
  raw: RawEvent,
  fields: Awaited<ReturnType<typeof decryptEventFields>>,
): EventSummary {
  return {
    id: raw.ID,
    calendarId: raw.CalendarID,
    title: fields.title,
    location: fields.location,
    description: fields.description,
    rrule: fields.rrule,
    start: new Date(raw.StartTime * 1000).toISOString(),
    end: new Date(raw.EndTime * 1000).toISOString(),
    allDay: raw.FullDay === 1,
    uid: raw.UID,
  };
}

async function buildReminders(reminders: string[] | undefined): Promise<
  { Type: number; Trigger: string }[] | null
> {
  if (!reminders || reminders.length === 0) return null;
  return reminders.map((entry) => ({
    Type: 1,
    Trigger: icalTrigger(parseDuration(entry)),
  }));
}

async function buildAttendees(
  options: EventServiceOptions & {
    uid: string;
    emails: string[];
    sessionKey: import("../crypto/types.ts").SessionKeyMaterial;
    signingKey: unknown;
  },
): Promise<{
  attendees: { Email: string; Token: string }[];
  clear: { Token: string; Status: number }[];
  added: { Email: string; AddressKeyPacket: string }[];
  external: string[];
  attendeesCard?: EventCard;
}> {
  const attendees: { Email: string; Token: string }[] = [];
  const clear: { Token: string; Status: number }[] = [];
  const added: { Email: string; AddressKeyPacket: string }[] = [];
  const external: string[] = [];
  const seen = new Set<string>();

  for (const raw of options.emails) {
    const email = raw.trim();
    if (!email) continue;
    const canonical = email.toLowerCase();
    if (seen.has(canonical)) continue;
    seen.add(canonical);

    const token = attendeeToken(options.uid, email);
    attendees.push({ Email: email, Token: token });
    clear.push({ Token: token, Status: 0 });

    const keysRes = await calendarApi<{
      Address: { Keys: { PublicKey: string }[] };
    }>(KEYS_ALL_PATH, {
      session: options.session,
      fetchImpl: options.fetchImpl,
      query: { Email: email },
    });

    if (keysRes.Address?.Keys?.[0]?.PublicKey) {
      const CryptoProxy = await getCalendarCrypto();
      const publicKey = await CryptoProxy.importPublicKey({
        armoredKey: keysRes.Address.Keys[0].PublicKey,
      });
      const addressKeyPacket = await encryptSessionKeyForRecipient(
        options.sessionKey,
        publicKey,
      );
      added.push({ Email: email, AddressKeyPacket: addressKeyPacket });
    } else {
      external.push(email);
    }
  }

  let attendeesCard: EventCard | undefined;
  if (attendees.length > 0) {
    attendeesCard = await encryptPartWithSessionKey(
      attendeesVevent(
        options.uid,
        attendees.map((entry) => ({ email: entry.Email, token: entry.Token })),
      ),
      options.sessionKey,
      options.signingKey,
    );
  }

  return { attendees, clear, added, external, attendeesCard };
}

export async function listEvents(
  options: EventServiceOptions & {
    calendarId: string;
    password: string;
    start?: Date;
    end?: Date;
  },
): Promise<EventSummary[]> {
  const range = defaultRange();
  const start = options.start ?? range.start;
  const end = options.end ?? range.end;
  const ctx = await unlockCalendarForEvents({
    session: options.session,
    calendarId: options.calendarId,
    password: options.password,
    fetchImpl: options.fetchImpl,
  });

  const data = await calendarApi<{ Events: RawEvent[] }>(
    `/calendar/v1/${options.calendarId}/events`,
    {
      session: options.session,
      fetchImpl: options.fetchImpl,
      query: {
        Start: Math.floor(start.getTime() / 1000),
        End: Math.floor(end.getTime() / 1000),
        Timezone: "UTC",
        Type: 0,
      },
    },
  );

  const out: EventSummary[] = [];
  for (const raw of data.Events ?? []) {
    const fields = await decryptEventFields(
      raw,
      ctx.calendarPrivateKey,
      ctx.addressPublicKey,
    );
    out.push(mapEvent(raw, fields));
  }
  return out;
}

export async function getEvent(
  options: EventServiceOptions & {
    calendarId: string;
    eventId: string;
    password: string;
  },
): Promise<EventSummary> {
  const ctx = await unlockCalendarForEvents({
    session: options.session,
    calendarId: options.calendarId,
    password: options.password,
    fetchImpl: options.fetchImpl,
  });

  const data = await calendarApi<{ Event: RawEvent }>(
    `/calendar/v1/${options.calendarId}/events/${options.eventId}`,
    { session: options.session, fetchImpl: options.fetchImpl },
  );

  const fields = await decryptEventFields(
    data.Event,
    ctx.calendarPrivateKey,
    ctx.addressPublicKey,
  );
  return mapEvent(data.Event, fields);
}

export async function createEvent(
  options: EventServiceOptions & {
    calendarId: string;
    password: string;
    input: EventInput;
  },
): Promise<CreateEventResult> {
  const ctx = await unlockCalendarForEvents({
    session: options.session,
    calendarId: options.calendarId,
    password: options.password,
    fetchImpl: options.fetchImpl,
  });

  const reminders = await buildReminders(options.input.reminders);
  const organizer =
    options.input.attendees && options.input.attendees.length > 0 ? ctx.email : "";
  const uid = `${Date.now()}@proton-cli`;
  const signed = signedVevent({
    uid,
    start: options.input.start,
    end: options.input.end,
    allDay: options.input.allDay ?? false,
    sequence: 0,
    rrule: options.input.rrule,
    organizer,
  });
  const encrypted = encryptedVevent(
    options.input.title,
    options.input.location ?? "",
    options.input.description ?? "",
  );
  const { signedCard, encryptedCard, sharedKeyPacket, sessionKey } =
    await encryptAndSignCardSplit(
      signed,
      encrypted,
      ctx.calendarPrivateKey,
      ctx.addressPrivateKey,
    );

  const event: Record<string, unknown> = {
    Permissions: 63,
    IsOrganizer: 1,
    SharedKeyPacket: sharedKeyPacket,
    SharedEventContent: [signedCard, encryptedCard],
    Notifications: reminders,
    Color: null,
  };

  let externalAttendees: string[] | undefined;
  if (options.input.attendees && options.input.attendees.length > 0) {
    const built = await buildAttendees({
      session: options.session,
      fetchImpl: options.fetchImpl,
      uid,
      emails: options.input.attendees,
      sessionKey,
      signingKey: ctx.addressPrivateKey,
    });
    if (built.attendeesCard) {
      event.AttendeesEventContent = [built.attendeesCard];
    }
    event.Attendees = built.clear;
    if (built.added.length > 0) {
      event.AddedProtonAttendees = built.added;
    }
    if (built.external.length > 0) {
      externalAttendees = built.external;
    }
  }

  const body = {
    MemberID: ctx.memberId,
    Events: [{ Overwrite: 0, Event: event }],
  };

  const created = await calendarApi<{
    Responses: { Response: { Event: { ID: string } } }[];
  }>(`/calendar/v1/${options.calendarId}/events/sync`, {
    method: "PUT",
    body,
    session: options.session,
    fetchImpl: options.fetchImpl,
  });

  const id = created.Responses?.[0]?.Response?.Event?.ID ?? "";
  return { id, externalAttendees };
}

export async function updateEvent(
  options: EventServiceOptions & {
    calendarId: string;
    eventId: string;
    password: string;
    title?: string;
    location?: string;
    description?: string;
    start?: Date;
    end?: Date;
  },
): Promise<void> {
  const ctx = await unlockCalendarForEvents({
    session: options.session,
    calendarId: options.calendarId,
    password: options.password,
    fetchImpl: options.fetchImpl,
  });

  const current = await calendarApi<{ Event: RawEvent }>(
    `/calendar/v1/${options.calendarId}/events/${options.eventId}`,
    { session: options.session, fetchImpl: options.fetchImpl },
  );

  const existing = await decryptEventFields(
    current.Event,
    ctx.calendarPrivateKey,
    ctx.addressPublicKey,
  );

  const title = options.title ?? existing.title;
  const location = options.location ?? existing.location;
  const description = options.description ?? existing.description;
  const start =
    options.start ?? new Date(current.Event.StartTime * 1000);
  const end = options.end ?? new Date(current.Event.EndTime * 1000);

  const signed = signedVevent({
    uid: current.Event.UID,
    start,
    end,
    allDay: current.Event.FullDay === 1,
    sequence: 1,
    rrule: existing.rrule,
    organizer: existing.organizer,
  });
  const encrypted = encryptedVevent(title, location, description);
  const { signedCard, encryptedCard } = await encryptAndSignCardSplit(
    signed,
    encrypted,
    ctx.calendarPrivateKey,
    ctx.addressPrivateKey,
    current.Event.SharedKeyPacket,
  );

  const body = {
    MemberID: ctx.memberId,
    Events: [
      {
        ID: options.eventId,
        Event: {
          Permissions: 63,
          IsOrganizer: 1,
          SharedEventContent: [signedCard, encryptedCard],
          Notifications: null,
          Color: null,
        },
      },
    ],
  };

  await calendarApi(`/calendar/v1/${options.calendarId}/events/sync`, {
    method: "PUT",
    body,
    session: options.session,
    fetchImpl: options.fetchImpl,
  });
}

export async function deleteEvent(
  options: EventServiceOptions & {
    calendarId: string;
    eventId: string;
    password: string;
  },
): Promise<void> {
  const ctx = await unlockCalendarForEvents({
    session: options.session,
    calendarId: options.calendarId,
    password: options.password,
    fetchImpl: options.fetchImpl,
  });

  await calendarApi(`/calendar/v1/${options.calendarId}/events/sync`, {
    method: "PUT",
    body: {
      MemberID: ctx.memberId,
      Events: [{ ID: options.eventId }],
    },
    session: options.session,
    fetchImpl: options.fetchImpl,
  });
}

export async function resolveEventRef(
  options: EventServiceOptions & {
    args: string[];
    password: string;
  },
): Promise<{ calendarId: string; eventId: string }> {
  if (options.args.length === 2) {
    return { calendarId: options.args[0]!, eventId: options.args[1]! };
  }

  const needle = options.args[0]!;
  const calendars = await listCalendars(options);
  const range = defaultRange();
  const matches: { calendarId: string; eventId: string; title: string; start: Date }[] =
    [];

  for (const cal of calendars) {
    let events: EventSummary[] = [];
    try {
      events = await listEvents({
        session: options.session,
        fetchImpl: options.fetchImpl,
        calendarId: cal.id,
        password: options.password,
        start: range.start,
        end: range.end,
      });
    } catch {
      continue;
    }
    for (const event of events) {
      if (
        event.title &&
        event.title.toLowerCase().includes(needle.toLowerCase())
      ) {
        matches.push({
          calendarId: cal.id,
          eventId: event.id,
          title: event.title,
          start: new Date(event.start),
        });
      }
    }
  }

  if (matches.length === 0) {
    throw new Error(`Event not found: ${needle}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple events match "${needle}". Pass CALENDAR_ID EVENT_ID explicitly.`,
    );
  }
  return { calendarId: matches[0]!.calendarId, eventId: matches[0]!.eventId };
}

export { resolveCalendarId, defaultRange };
