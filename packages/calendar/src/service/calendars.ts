import { generateCalendarKeyPayload } from "../crypto/calendar-key.ts";
import {
  primaryAddressKey,
  unlockCalendarKeys,
  type UnlockedCalendarKeys,
} from "../crypto/unlock.ts";
import { unlockPasswordScope } from "../crypto/password-scope.ts";
import { calendarApi } from "../proton/api.ts";
import { CALENDARS_PATH } from "../proton/constants.ts";
import type { Session } from "../proton/types.ts";

export interface CalendarSummary {
  id: string;
  name: string;
  color: string;
  description: string;
  memberCount: number;
}

interface ApiCalendar {
  ID: string;
  Members: {
    Name: string;
    Color: string;
    Description: string;
    Email: string;
    AddressID: string;
    ID: string;
  }[];
}

export interface CalendarServiceOptions {
  session: Session;
  fetchImpl?: typeof fetch;
}

function mapCalendar(c: ApiCalendar): CalendarSummary {
  const member = c.Members[0];
  return {
    id: c.ID,
    name: member?.Name ?? "",
    color: member?.Color ?? "",
    description: member?.Description ?? "",
    memberCount: c.Members.length,
  };
}

export async function listCalendars(
  options: CalendarServiceOptions,
): Promise<CalendarSummary[]> {
  const data = await calendarApi<{ Calendars: ApiCalendar[] }>(CALENDARS_PATH, {
    session: options.session,
    fetchImpl: options.fetchImpl,
  });
  return (data.Calendars ?? []).map(mapCalendar);
}

export async function createCalendar(
  options: CalendarServiceOptions & {
    name: string;
    color: string;
    password: string;
    unlocked?: UnlockedCalendarKeys;
  },
): Promise<string> {
  const unlocked =
    options.unlocked ??
    (await unlockCalendarKeys({
      session: options.session,
      password: options.password,
      fetchImpl: options.fetchImpl,
    }));

  const addr = primaryAddressKey(unlocked);
  const created = await calendarApi<{ Calendar: { ID: string } }>(
    CALENDARS_PATH,
    {
      method: "POST",
      body: {
        Name: options.name,
        Color: options.color,
        Display: 1,
        AddressID: addr.addressId,
      },
      session: options.session,
      fetchImpl: options.fetchImpl,
    },
  );

  const calendarId = created.Calendar.ID;
  const keyPayload = await generateCalendarKeyPayload({
    addressId: addr.addressId,
    privateKey: addr.privateKey,
    publicKey: addr.publicKey,
  });

  await calendarApi(`${CALENDARS_PATH}/${calendarId}/keys`, {
    method: "POST",
    body: {
      AddressID: keyPayload.AddressID,
      PrivateKey: keyPayload.PrivateKey,
      Passphrase: {
        DataPacket: keyPayload.Passphrase.DataPacket,
        KeyPacket: keyPayload.Passphrase.KeyPacket,
      },
      Signature: keyPayload.Signature,
    },
    session: options.session,
    fetchImpl: options.fetchImpl,
  });

  return calendarId;
}

async function calendarMemberId(
  options: CalendarServiceOptions & { calendarId: string; unlocked: UnlockedCalendarKeys },
): Promise<string> {
  const data = await calendarApi<{
    Members: { ID: string; AddressID: string }[];
  }>(`${CALENDARS_PATH}/${options.calendarId}/members`, {
    session: options.session,
    fetchImpl: options.fetchImpl,
  });

  for (const member of data.Members) {
    if (options.unlocked.addressKeys.has(member.AddressID)) {
      return member.ID;
    }
  }
  throw new Error(`No matching member for calendar ${options.calendarId}`);
}

export async function renameCalendar(
  options: CalendarServiceOptions & {
    calendarId: string;
    name?: string;
    color?: string;
    password: string;
    unlocked?: UnlockedCalendarKeys;
  },
): Promise<void> {
  if (!options.name && !options.color) {
    throw new Error("Nothing to update: pass name and/or color.");
  }

  const unlocked =
    options.unlocked ??
    (await unlockCalendarKeys({
      session: options.session,
      password: options.password,
      fetchImpl: options.fetchImpl,
    }));

  const memberId = await calendarMemberId({
    session: options.session,
    calendarId: options.calendarId,
    unlocked,
    fetchImpl: options.fetchImpl,
  });

  const body: Record<string, string> = {};
  if (options.name) body.Name = options.name;
  if (options.color) body.Color = options.color;

  await calendarApi(
    `${CALENDARS_PATH}/${options.calendarId}/members/${memberId}`,
    {
      method: "PUT",
      body,
      session: options.session,
      fetchImpl: options.fetchImpl,
    },
  );
}

export async function deleteCalendar(
  options: CalendarServiceOptions & {
    calendarId: string;
    username: string;
    password: string;
  },
): Promise<void> {
  await unlockPasswordScope({
    session: options.session,
    username: options.username,
    password: options.password,
    fetchImpl: options.fetchImpl,
  });

  await calendarApi(`${CALENDARS_PATH}/${options.calendarId}`, {
    method: "DELETE",
    session: options.session,
    fetchImpl: options.fetchImpl,
  });
}

export async function resolveCalendarId(
  options: CalendarServiceOptions & { nameOrId?: string },
): Promise<string> {
  const calendars = await listCalendars(options);
  if (!options.nameOrId) {
    if (calendars.length === 0) {
      throw new Error("No calendars found.");
    }
    return calendars[0]!.id;
  }
  const needle = options.nameOrId;
  for (const cal of calendars) {
    if (cal.id === needle) return cal.id;
  }
  for (const cal of calendars) {
    if (cal.name.toLowerCase() === needle.toLowerCase()) return cal.id;
  }
  throw new Error(`Calendar not found: ${needle}`);
}

export { unlockCalendarKeys, type UnlockedCalendarKeys };
