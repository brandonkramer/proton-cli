import { attendeeToken } from "../util/ical.ts";
import { calendarApi } from "../proton/api.ts";
import { ADDRESSES_PATH } from "../proton/constants.ts";
import type { Session } from "../proton/types.ts";
import type { EventServiceOptions } from "./events.ts";

/** ATTENDEE_STATUS_API (Proton WebClients). */
export const ATTENDEE_STATUS = {
  NEEDS_ACTION: 0,
  TENTATIVE: 1,
  DECLINED: 2,
  ACCEPTED: 3,
} as const;

export type RespondStatusFlag = "accept" | "tentative" | "decline";

interface RawAttendee {
  ID: string;
  Token: string;
  Status: number;
}

interface RawAttendeesInfo {
  Attendees: RawAttendee[];
  MoreAttendees?: number;
}

interface RawInvitationEvent {
  ID: string;
  UID: string;
  IsOrganizer?: number;
  AttendeesInfo?: RawAttendeesInfo;
}

export interface RespondResult {
  status: string;
  calendarId: string;
  eventId: string;
  attendeeId: string;
}

export function parseRespondStatus(status: string): number {
  switch (status.trim().toLowerCase()) {
    case "accept":
      return ATTENDEE_STATUS.ACCEPTED;
    case "tentative":
      return ATTENDEE_STATUS.TENTATIVE;
    case "decline":
      return ATTENDEE_STATUS.DECLINED;
    default:
      throw new Error(`invalid --status "${status}" (use: accept, tentative, decline)`);
  }
}

export function respondStatusLabel(status: number): string {
  switch (status) {
    case ATTENDEE_STATUS.ACCEPTED:
      return "accepted";
    case ATTENDEE_STATUS.TENTATIVE:
      return "tentatively accepted";
    case ATTENDEE_STATUS.DECLINED:
      return "declined";
    default:
      return "did not answer";
  }
}

function findSelfAttendee(
  uid: string,
  emails: string[],
  attendees: RawAttendee[],
): { attendeeId: string; email: string } | null {
  const tokenToEmail = new Map<string, string>();
  for (const email of emails) {
    tokenToEmail.set(attendeeToken(uid, email), email);
  }
  for (const attendee of attendees) {
    const email = tokenToEmail.get(attendee.Token);
    if (email) {
      return { attendeeId: attendee.ID, email };
    }
  }
  return null;
}

async function fetchAccountEmails(
  session: Session,
  fetchImpl?: typeof fetch,
): Promise<string[]> {
  const data = await calendarApi<{ Addresses: { Email: string }[] }>(ADDRESSES_PATH, {
    session,
    fetchImpl,
  });
  return (data.Addresses ?? []).map((entry) => entry.Email);
}

async function findSelfAttendeePaged(
  options: EventServiceOptions & {
    calendarId: string;
    eventId: string;
    uid: string;
    emails: string[];
  },
): Promise<{ attendeeId: string; email: string } | null> {
  for (let page = 1; ; page += 1) {
    const data = await calendarApi<{
      Attendees: RawAttendee[];
      MoreAttendees?: number;
    }>(`/calendar/v1/${options.calendarId}/events/${options.eventId}/attendees`, {
      session: options.session,
      fetchImpl: options.fetchImpl,
      query: { Page: page },
    });

    const match = findSelfAttendee(options.uid, options.emails, data.Attendees ?? []);
    if (match) return match;

    if (data.MoreAttendees !== 1 || (data.Attendees ?? []).length === 0) {
      return null;
    }
  }
}

/** Accept, tentatively accept, or decline an invitation (REQ-CAL-006). */
export async function respondToEvent(
  options: EventServiceOptions & {
    calendarId: string;
    eventId: string;
    status: number;
    emails?: string[];
  },
): Promise<RespondResult> {
  const data = await calendarApi<{ Event: RawInvitationEvent }>(
    `/calendar/v1/${options.calendarId}/events/${options.eventId}`,
    { session: options.session, fetchImpl: options.fetchImpl },
  );

  const event = data.Event;
  if (event.IsOrganizer === 1) {
    throw new Error("You are the organizer of this event; RSVP is for attendees.");
  }

  const emails = options.emails ?? (await fetchAccountEmails(options.session, options.fetchImpl));
  let self = findSelfAttendee(
    event.UID,
    emails,
    event.AttendeesInfo?.Attendees ?? [],
  );

  if (!self && event.AttendeesInfo?.MoreAttendees === 1) {
    self = await findSelfAttendeePaged({
      session: options.session,
      fetchImpl: options.fetchImpl,
      calendarId: options.calendarId,
      eventId: options.eventId,
      uid: event.UID,
      emails,
    });
  }

  if (!self) {
    throw new Error("Attendee record for you on this event not found.");
  }

  await calendarApi(
    `/calendar/v1/${options.calendarId}/events/${options.eventId}/attendees/${self.attendeeId}`,
    {
      method: "PUT",
      body: {
        Status: options.status,
        UpdateTime: Math.floor(Date.now() / 1000),
      },
      session: options.session,
      fetchImpl: options.fetchImpl,
    },
  );

  return {
    status: respondStatusLabel(options.status),
    calendarId: options.calendarId,
    eventId: options.eventId,
    attendeeId: self.attendeeId,
  };
}
