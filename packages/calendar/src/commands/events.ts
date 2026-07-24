import {
  createEvent,
  defaultRange,
  deleteEvent,
  getEvent,
  listEvents,
  resolveCalendarId,
  resolveEventRef,
  updateEvent,
} from "../service/events.ts";
import {
  parseRespondStatus,
  respondToEvent,
} from "../service/respond.ts";
import { parseDateOnly, parseTime } from "../util/ical.ts";
import { parseDuration, formatDuration } from "../util/duration.ts";
import {
  agentFlags,
  emitJson,
  emitOk,
  fail,
  isDryRun,
  wantsJson,
} from "../util/agent.ts";
import { resolveAccountPassword } from "../util/password.ts";
import { requireSession } from "../util/session.ts";

function printEventsTable(events: Awaited<ReturnType<typeof listEvents>>): void {
  if (events.length === 0) {
    process.stdout.write("No events.\n");
    return;
  }
  for (const event of events) {
    const start = new Date(event.start);
    const end = new Date(event.end);
    process.stdout.write(
      `${start.toISOString().slice(0, 10)}\t${start.toISOString().slice(11, 16)}\t${formatDuration(end.getTime() - start.getTime())}\t${event.title}\t${event.calendarId}\t${event.id}\n`,
    );
  }
}

export async function runEventsList(options: {
  calendar?: string;
  start?: string;
  end?: string;
  password?: string;
  pass?: string;
}): Promise<void> {
  const saved = await requireSession();
  const password = await resolveAccountPassword(options);
  const calendarId = await resolveCalendarId({
    session: saved.session,
    nameOrId: options.calendar,
  });

  const range = defaultRange();
  const start = options.start ? parseDateOnly(options.start) : range.start;
  const end = options.end ? parseDateOnly(options.end) : range.end;

  const events = await listEvents({
    session: saved.session,
    calendarId,
    password,
    start,
    end,
  });

  if (wantsJson()) {
    emitJson({ ok: true, calendarId, events });
    return;
  }
  printEventsTable(events);
}

export async function runEventsGet(
  args: string[],
  options: { password?: string; pass?: string },
): Promise<void> {
  if (args.length === 0) {
    fail("Usage: calendar events get {CALENDAR_ID EVENT_ID | TITLE}");
  }

  const saved = await requireSession();
  const password = await resolveAccountPassword(options);
  const ref = await resolveEventRef({
    session: saved.session,
    args,
    password,
  });
  const event = await getEvent({
    session: saved.session,
    calendarId: ref.calendarId,
    eventId: ref.eventId,
    password,
  });

  if (wantsJson()) {
    emitJson({ ok: true, event });
    return;
  }

  process.stdout.write(`Event:    ${event.title}\n`);
  process.stdout.write(`Start:    ${event.start}\n`);
  process.stdout.write(`End:      ${event.end}\n`);
  if (event.location) process.stdout.write(`Location: ${event.location}\n`);
  if (event.description) process.stdout.write(`Description: ${event.description}\n`);
  if (event.rrule) process.stdout.write(`Recurrence: ${event.rrule}\n`);
  process.stdout.write(`ID:       ${event.id}\n`);
  process.stdout.write(`Calendar: ${event.calendarId}\n`);
}

export async function runEventsCreate(options: {
  calendar?: string;
  title?: string;
  location?: string;
  description?: string;
  start?: string;
  duration?: string;
  allDay?: boolean;
  rrule?: string;
  remind?: string[];
  attendee?: string[];
  password?: string;
  pass?: string;
}): Promise<void> {
  if (!options.title || !options.start) {
    fail("--title and --start are required");
  }

  const durationMs = parseDuration(options.duration ?? "1h");
  const start = parseTime(options.start);
  const end = new Date(start.getTime() + durationMs);

  if (isDryRun()) {
    if (wantsJson()) {
      emitJson({
        ok: true,
        dryRun: true,
        action: "create",
        calendarId: options.calendar ?? "(default)",
        title: options.title,
        start: start.toISOString(),
        end: end.toISOString(),
        attendees: options.attendee ?? [],
      });
    } else {
      process.stdout.write(
        `[dry-run] would create event "${options.title}" in ${options.calendar ?? "default calendar"}\n`,
      );
    }
    return;
  }

  const saved = await requireSession();
  const calendarId = await resolveCalendarId({
    session: saved.session,
    nameOrId: options.calendar,
  });

  const password = await resolveAccountPassword(options);
  const result = await createEvent({
    session: saved.session,
    calendarId,
    password,
    input: {
      title: options.title,
      location: options.location,
      description: options.description,
      start,
      end,
      allDay: options.allDay,
      rrule: options.rrule,
      reminders: options.remind,
      attendees: options.attendee,
    },
  });

  if (wantsJson()) {
    emitJson({
      ok: true,
      id: result.id,
      calendarId,
      title: options.title,
      externalAttendees: result.externalAttendees,
    });
    return;
  }

  process.stdout.write(`Created event "${options.title}" (${result.id})\n`);
  if (result.externalAttendees?.length) {
    process.stdout.write(
      `External attendees require email invite: ${result.externalAttendees.join(", ")}\n`,
    );
  }
}

export async function runEventsUpdate(
  calendarId: string,
  eventId: string,
  options: {
    title?: string;
    location?: string;
    description?: string;
    start?: string;
    duration?: string;
    password?: string;
    pass?: string;
  },
): Promise<void> {
  if (
    !options.title &&
    !options.location &&
    !options.description &&
    !options.start &&
    !options.duration
  ) {
    fail("Nothing to update: pass --title, --location, --description, and/or --start");
  }

  if (options.duration && !options.start) {
    fail("--duration requires --start when updating event timing");
  }

  if (isDryRun()) {
    if (wantsJson()) {
      emitJson({
        ok: true,
        dryRun: true,
        action: "update",
        calendarId,
        eventId,
      });
    } else {
      process.stdout.write(`[dry-run] would update event ${eventId}\n`);
    }
    return;
  }

  const saved = await requireSession();
  const password = await resolveAccountPassword(options);

  let start: Date | undefined;
  let end: Date | undefined;
  if (options.start) {
    start = parseTime(options.start);
    if (options.duration) {
      end = new Date(start.getTime() + parseDuration(options.duration));
    }
  }

  await updateEvent({
    session: saved.session,
    calendarId,
    eventId,
    password,
    title: options.title,
    location: options.location,
    description: options.description,
    start,
    end,
  });

  emitOk({ message: wantsJson() ? undefined : "Event updated." });
  if (wantsJson()) {
    emitJson({ ok: true, calendarId, eventId });
  }
}

export async function runEventsDelete(
  args: string[],
  options: { password?: string; pass?: string; yes?: boolean },
): Promise<void> {
  if (args.length === 0) {
    fail("Usage: calendar events delete {CALENDAR_ID EVENT_ID | TITLE}");
  }

  const saved = await requireSession();
  const password = await resolveAccountPassword(options);
  const ref = await resolveEventRef({
    session: saved.session,
    args,
    password,
  });

  if (isDryRun()) {
    if (wantsJson()) {
      emitJson({
        ok: true,
        dryRun: true,
        action: "delete",
        calendarId: ref.calendarId,
        eventId: ref.eventId,
      });
    } else {
      process.stdout.write(`[dry-run] would delete event ${ref.eventId}\n`);
    }
    return;
  }

  if (!options.yes && !agentFlags().yes) {
    process.stderr.write(
      `Deleting event ${ref.eventId}. Re-run with -y/--yes to confirm.\n`,
    );
    fail("Confirmation required.", 2);
  }

  await deleteEvent({
    session: saved.session,
    calendarId: ref.calendarId,
    eventId: ref.eventId,
    password,
  });

  if (wantsJson()) {
    emitJson({ ok: true, calendarId: ref.calendarId, eventId: ref.eventId });
  } else {
    emitOk({ message: "Event deleted." });
  }
}

export async function runEventsRespond(
  args: string[],
  options: {
    status?: string;
    password?: string;
    pass?: string;
  },
): Promise<void> {
  if (!options.status) {
    fail("--status is required (accept, tentative, or decline)");
  }
  if (args.length === 0) {
    fail("Usage: calendar events respond {CALENDAR_ID EVENT_ID | TITLE} --status accept|tentative|decline");
  }

  const apiStatus = parseRespondStatus(options.status);

  if (isDryRun() && args.length === 2) {
    if (wantsJson()) {
      emitJson({
        ok: true,
        dryRun: true,
        action: "respond",
        status: options.status,
        calendarId: args[0],
        eventId: args[1],
      });
    } else {
      process.stdout.write(
        `[dry-run] would respond "${options.status}" to event ${args[1]}\n`,
      );
    }
    return;
  }

  const saved = await requireSession();
  const password = await resolveAccountPassword(options);
  const ref = await resolveEventRef({
    session: saved.session,
    args,
    password,
  });

  if (isDryRun()) {
    if (wantsJson()) {
      emitJson({
        ok: true,
        dryRun: true,
        action: "respond",
        status: options.status,
        calendarId: ref.calendarId,
        eventId: ref.eventId,
      });
    } else {
      process.stdout.write(
        `[dry-run] would respond "${options.status}" to event ${ref.eventId}\n`,
      );
    }
    return;
  }

  const result = await respondToEvent({
    session: saved.session,
    calendarId: ref.calendarId,
    eventId: ref.eventId,
    status: apiStatus,
  });

  if (wantsJson()) {
    emitJson({
      ok: true,
      calendarId: result.calendarId,
      eventId: result.eventId,
      attendeeId: result.attendeeId,
      status: result.status,
    });
    return;
  }

  process.stdout.write(`Responded "${result.status}" to event ${result.eventId}.\n`);
}
