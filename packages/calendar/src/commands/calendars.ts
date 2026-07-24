import {
  createCalendar,
  deleteCalendar,
  listCalendars,
  renameCalendar,
} from "../service/calendars.ts";
import {
  DEFAULT_CALENDAR_COLOR,
  validateAccentColor,
} from "../util/colors.ts";
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

function printCalendarsTable(
  calendars: Awaited<ReturnType<typeof listCalendars>>,
): void {
  if (calendars.length === 0) {
    process.stdout.write("No calendars.\n");
    return;
  }
  for (const cal of calendars) {
    process.stdout.write(
      `${cal.id}\t${cal.name}\t${cal.color}\tmembers=${cal.memberCount}\n`,
    );
  }
}

export async function runCalendarsList(): Promise<void> {
  const saved = await requireSession();
  const calendars = await listCalendars({ session: saved.session });
  if (wantsJson()) {
    emitJson({ ok: true, calendars });
    return;
  }
  printCalendarsTable(calendars);
}

export async function runCalendarsCreate(options: {
  name?: string;
  color?: string;
  password?: string;
  pass?: string;
}): Promise<void> {
  if (!options.name) {
    fail("--name is required");
  }
  const color = options.color ?? DEFAULT_CALENDAR_COLOR;
  const colorError = validateAccentColor(color);
  if (colorError) fail(colorError);

  if (isDryRun()) {
    if (wantsJson()) {
      emitJson({ ok: true, dryRun: true, action: "create", name: options.name, color });
    } else {
      process.stdout.write(
        `[dry-run] would create calendar "${options.name}" (${color})\n`,
      );
    }
    return;
  }

  const saved = await requireSession();
  const password = await resolveAccountPassword(options);
  const id = await createCalendar({
    session: saved.session,
    name: options.name,
    color,
    password,
  });

  if (wantsJson()) {
    emitJson({ ok: true, id, name: options.name, color });
    return;
  }
  process.stdout.write(`Created calendar "${options.name}" (${id})\n`);
}

export async function runCalendarsRename(
  calendarId: string,
  options: {
    name?: string;
    color?: string;
    password?: string;
    pass?: string;
  },
): Promise<void> {
  if (!options.name && !options.color) {
    fail("Nothing to update: pass --name and/or --color");
  }
  if (options.color) {
    const colorError = validateAccentColor(options.color);
    if (colorError) fail(colorError);
  }

  if (isDryRun()) {
    if (wantsJson()) {
      emitJson({
        ok: true,
        dryRun: true,
        action: "rename",
        calendarId,
        name: options.name,
        color: options.color,
      });
    } else {
      process.stdout.write(`[dry-run] would update calendar ${calendarId}\n`);
    }
    return;
  }

  const saved = await requireSession();
  const password = await resolveAccountPassword(options);
  await renameCalendar({
    session: saved.session,
    calendarId,
    name: options.name,
    color: options.color,
    password,
  });

  emitOk({
    message: wantsJson() ? undefined : "Calendar updated.",
  });
  if (wantsJson()) {
    emitJson({
      ok: true,
      calendarId,
      name: options.name,
      color: options.color,
    });
  }
}

export async function runCalendarsDelete(
  calendarId: string,
  options: { password?: string; pass?: string; yes?: boolean },
): Promise<void> {
  if (isDryRun()) {
    if (wantsJson()) {
      emitJson({ ok: true, dryRun: true, action: "delete", calendarId });
    } else {
      process.stdout.write(`[dry-run] would delete calendar ${calendarId}\n`);
    }
    return;
  }

  const saved = await requireSession();
  let password: string;
  try {
    password = await resolveAccountPassword(options);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Password required for calendar delete.");
  }

  if (!options.yes && !agentFlags().yes && process.stdin.isTTY && !wantsJson()) {
    process.stderr.write(
      `Deleting calendar ${calendarId}. Re-run with -y/--yes to confirm.\n`,
    );
    fail("Confirmation required.", 2);
  }

  await deleteCalendar({
    session: saved.session,
    calendarId,
    username: saved.username,
    password,
  });

  if (wantsJson()) {
    emitJson({ ok: true, calendarId });
  } else {
    emitOk({ message: "Calendar deleted." });
  }
}
