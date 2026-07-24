import type { Command } from "commander";
import {
  runCalendarsCreate,
  runCalendarsDelete,
  runCalendarsList,
  runCalendarsRename,
} from "./commands/calendars.ts";
import {
  runEventsCreate,
  runEventsDelete,
  runEventsGet,
  runEventsList,
  runEventsRespond,
  runEventsUpdate,
} from "./commands/events.ts";
import { configureAgentFlags } from "./util/agent.ts";

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** Register `proton calendar …` (and legacy `protoncal …`) commands. */
export function registerCalendarCommands(calendar: Command): void {
  calendar.hook("preAction", (thisCommand) => {
    const globals = thisCommand.optsWithGlobals() as {
      json?: boolean;
      yes?: boolean;
    };
    const local = thisCommand.opts() as { dryRun?: boolean };
    configureAgentFlags({
      json: Boolean(globals.json),
      yes: Boolean(globals.yes),
      dryRun: Boolean(local.dryRun),
    });
  });

  const calendars = calendar
    .command("calendars")
    .description("Manage calendars");

  calendars
    .command("list")
    .description("List calendars")
    .action(async () => {
      try {
        await runCalendarsList();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
      }
    });

  calendars
    .command("create")
    .description("Create a calendar")
    .requiredOption("--name <name>", "Calendar name")
    .option("--color <hex>", "Proton accent color", "#8080FF")
    .option("--password <password>", "Account password (or PROTON_PASSWORD)")
    .option("--pass <ref>", "Pass item for account password")
    .option("--dry-run", "Print intent without calling the API")
    .action(async (opts: {
      name: string;
      color: string;
      password?: string;
      pass?: string;
      dryRun?: boolean;
    }) => {
      try {
        await runCalendarsCreate(opts);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
      }
    });

  calendars
    .command("rename")
    .description("Rename or recolor a calendar")
    .argument("<calendar-id>", "Calendar ID")
    .option("--name <name>", "New calendar name")
    .option("--color <hex>", "New Proton accent color")
    .option("--password <password>", "Account password (or PROTON_PASSWORD)")
    .option("--pass <ref>", "Pass item for account password")
    .option("--dry-run", "Print intent without calling the API")
    .action(async (
      calendarId: string,
      opts: {
        name?: string;
        color?: string;
        password?: string;
        pass?: string;
        dryRun?: boolean;
      },
    ) => {
      try {
        await runCalendarsRename(calendarId, opts);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
      }
    });

  calendars
    .command("delete")
    .description("Delete a calendar (requires account password)")
    .argument("<calendar-id>", "Calendar ID")
    .option("--password <password>", "Account password (or PROTON_PASSWORD)")
    .option("--pass <ref>", "Pass item for account password")
    .option("--dry-run", "Print intent without calling the API")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (
      calendarId: string,
      opts: {
        password?: string;
        pass?: string;
        dryRun?: boolean;
        yes?: boolean;
      },
    ) => {
      try {
        await runCalendarsDelete(calendarId, opts);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
      }
    });

  const events = calendar.command("events").description("Manage events");

  events
    .command("list")
    .description("List events")
    .option("--calendar <id>", "Calendar ID or name")
    .option("--start <date>", "Start date YYYY-MM-DD")
    .option("--end <date>", "End date YYYY-MM-DD")
    .option("--password <password>", "Account password (or PROTON_PASSWORD)")
    .option("--pass <ref>", "Pass item for account password")
    .action(async (opts: {
      calendar?: string;
      start?: string;
      end?: string;
      password?: string;
      pass?: string;
    }) => {
      try {
        await runEventsList(opts);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
      }
    });

  events
    .command("get")
    .description("Get an event by REF")
    .argument("[args...]", "CALENDAR_ID EVENT_ID or TITLE")
    .option("--password <password>", "Account password (or PROTON_PASSWORD)")
    .option("--pass <ref>", "Pass item for account password")
    .action(async (args: string[], opts: { password?: string; pass?: string }) => {
      try {
        await runEventsGet(args, opts);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
      }
    });

  events
    .command("create")
    .description("Create an event")
    .option("--calendar <id>", "Calendar ID or name")
    .requiredOption("--title <title>", "Event title")
    .option("--location <text>", "Event location")
    .option("--description <text>", "Event description")
    .requiredOption("--start <time>", "Start time (RFC3339 or YYYY-MM-DDTHH:MM)")
    .option("--duration <dur>", "Duration (e.g. 1h, 30m)", "1h")
    .option("--all-day", "All-day event")
    .option("--rrule <rule>", "Recurrence rule (iCal RRULE)")
    .option("--remind <dur>", "Reminder before start (repeatable)", collect, [])
    .option("--attendee <email>", "Attendee email (repeatable)", collect, [])
    .option("--password <password>", "Account password (or PROTON_PASSWORD)")
    .option("--pass <ref>", "Pass item for account password")
    .option("--dry-run", "Print intent without calling the API")
    .action(async (opts: {
      calendar?: string;
      title: string;
      location?: string;
      description?: string;
      start: string;
      duration?: string;
      allDay?: boolean;
      rrule?: string;
      remind?: string[];
      attendee?: string[];
      password?: string;
      pass?: string;
      dryRun?: boolean;
    }) => {
      try {
        await runEventsCreate(opts);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
      }
    });

  events
    .command("update")
    .description("Update an event by REF")
    .argument("<calendar-id>", "Calendar ID")
    .argument("<event-id>", "Event ID")
    .option("--title <title>", "New title")
    .option("--location <text>", "New location")
    .option("--description <text>", "New description")
    .option("--start <time>", "New start time")
    .option("--duration <dur>", "New duration")
    .option("--password <password>", "Account password (or PROTON_PASSWORD)")
    .option("--pass <ref>", "Pass item for account password")
    .option("--dry-run", "Print intent without calling the API")
    .action(async (
      calendarId: string,
      eventId: string,
      opts: {
        title?: string;
        location?: string;
        description?: string;
        start?: string;
        duration?: string;
        password?: string;
        pass?: string;
        dryRun?: boolean;
      },
    ) => {
      try {
        await runEventsUpdate(calendarId, eventId, opts);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
      }
    });

  events
    .command("delete")
    .description("Delete an event by REF")
    .argument("[args...]", "CALENDAR_ID EVENT_ID or TITLE")
    .option("--password <password>", "Account password (or PROTON_PASSWORD)")
    .option("--pass <ref>", "Pass item for account password")
    .option("--dry-run", "Print intent without calling the API")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (
      args: string[],
      opts: {
        password?: string;
        pass?: string;
        dryRun?: boolean;
        yes?: boolean;
      },
    ) => {
      try {
        await runEventsDelete(args, opts);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
      }
    });

  events
    .command("respond")
    .description("Reply to an invitation (accept, tentative, or decline)")
    .argument("[args...]", "CALENDAR_ID EVENT_ID or TITLE")
    .requiredOption("--status <status>", "Response: accept, tentative, or decline")
    .option("--password <password>", "Account password (or PROTON_PASSWORD)")
    .option("--pass <ref>", "Pass item for account password")
    .option("--dry-run", "Print intent without calling the API")
    .action(async (
      args: string[],
      opts: {
        status: string;
        password?: string;
        pass?: string;
        dryRun?: boolean;
      },
    ) => {
      try {
        await runEventsRespond(args, opts);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
      }
    });
}
