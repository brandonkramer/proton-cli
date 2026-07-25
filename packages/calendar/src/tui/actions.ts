import { configDir } from "../config/paths.ts";
import { loadSession, signOut } from "../proton/auth.ts";
import { listCalendars } from "../service/calendars.ts";
import {
  createEvent,
  defaultRange,
  listEvents,
  resolveCalendarId,
} from "../service/events.ts";
import { showMessage } from "../ui/message.tsx";
import { showCalendarList, showEventList } from "../ui/list-view.tsx";
import {
  inkPromptOptionalText,
  inkPromptSelect,
  inkPromptText,
} from "../ui/prompts.tsx";
import { showStatus } from "../ui/status-view.tsx";
import { runTask } from "../ui/task.tsx";
import { parseDuration } from "../util/duration.ts";
import { parseTime } from "../util/ical.ts";
import { resolveAccountPassword } from "../util/password.ts";
import { requireSession } from "../util/session.ts";

function defaultStartLocal(): string {
  const d = new Date(Date.now() + 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function actionSignout(): Promise<void> {
  await signOut();
  await showMessage({
    variant: "success",
    title: "Signed out",
    body: "Calendar session cleared.",
    holdMs: 700,
  });
}

export async function actionListCalendars(): Promise<void> {
  const calendars = await runTask({
    title: "List calendars",
    steps: [{ id: "fetch", label: "Fetching calendars" }],
    run: async (ui) => {
      ui.updateStep("fetch", { status: "running" });
      const saved = await requireSession();
      const items = await listCalendars({ session: saved.session });
      ui.updateStep("fetch", {
        status: "done",
        detail: `${items.length}`,
      });
      return items;
    },
  });

  await showCalendarList(calendars);
}

export async function actionListEvents(): Promise<void> {
  const events = await runTask({
    title: "List events",
    steps: [
      { id: "unlock", label: "Unlocking calendar keys" },
      { id: "fetch", label: "Fetching events" },
    ],
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      const saved = await requireSession();
      const password = await resolveAccountPassword({});
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("fetch", { status: "running" });
      const calendarId = await resolveCalendarId({
        session: saved.session,
        nameOrId: undefined,
      });
      const range = defaultRange();
      const items = await listEvents({
        session: saved.session,
        calendarId,
        password,
        start: range.start,
        end: range.end,
      });
      ui.updateStep("fetch", {
        status: "done",
        detail: `${items.length}`,
      });
      return items;
    },
  });

  await showEventList(events);
}

export async function actionCreateEvent(): Promise<void> {
  const saved = await requireSession();
  const calendars = await listCalendars({ session: saved.session });
  if (calendars.length === 0) {
    await showMessage({
      variant: "error",
      title: "No calendars",
      body: "Create a calendar first (proton calendar calendars create).",
      holdMs: 1500,
    });
    return;
  }

  let calendarId = calendars[0]!.id;
  if (calendars.length > 1) {
    const picked = await inkPromptSelect(
      "Calendar",
      calendars.map((c) => ({ label: c.name, value: c.id })),
    );
    if (!picked) {
      await showMessage({
        variant: "info",
        title: "Cancelled",
        body: "Event not created.",
        holdMs: 700,
      });
      return;
    }
    calendarId = picked;
  }

  let title: string;
  let startRaw: string;
  let durationRaw: string;
  let location: string;
  try {
    title = await inkPromptText("Title", {
      placeholder: "Standup",
    });
    startRaw = await inkPromptText("Start", {
      defaultValue: defaultStartLocal(),
      hint: "Formats: YYYY-MM-DDTHH:mm or YYYY-MM-DD HH:mm",
    });
    durationRaw = await inkPromptText("Duration", {
      defaultValue: "1h",
      hint: "e.g. 30m, 1h, 1d",
    });
    location = await inkPromptOptionalText("Location");
  } catch {
    await showMessage({
      variant: "info",
      title: "Cancelled",
      body: "Event not created.",
      holdMs: 700,
    });
    return;
  }

  const start = parseTime(startRaw);
  const end = new Date(start.getTime() + parseDuration(durationRaw));
  const password = await resolveAccountPassword({});

  const result = await runTask({
    title: "Add event",
    steps: [
      { id: "unlock", label: "Unlocking calendar keys" },
      { id: "create", label: "Creating event" },
    ],
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("create", { status: "running" });
      const created = await createEvent({
        session: saved.session,
        calendarId,
        password,
        input: {
          title,
          location: location || undefined,
          start,
          end,
        },
      });
      ui.updateStep("create", { status: "done", detail: created.id });
      return created;
    },
  });

  await showMessage({
    variant: "success",
    title: "Event created",
    body: `"${title}" (${result.id})`,
    holdMs: 1200,
  });
}

export async function actionStatus(): Promise<void> {
  const session = await loadSession();
  let calendarCount = 0;
  let eventCount: number | null = null;

  if (session) {
    try {
      const calendars = await listCalendars({ session: session.session });
      calendarCount = calendars.length;

      try {
        const password = await resolveAccountPassword({});
        const calendarId = await resolveCalendarId({
          session: session.session,
          nameOrId: undefined,
        });
        const range = defaultRange();
        const events = await listEvents({
          session: session.session,
          calendarId,
          password,
          start: range.start,
          end: range.end,
        });
        eventCount = events.length;
      } catch {
        // Status screen still useful when password/unlock unavailable.
      }
    } catch {
      // Status screen still useful when fetch fails.
    }
  }

  await showStatus({
    signedIn: Boolean(session),
    username: session?.username,
    calendarCount,
    eventCount,
    configDir: configDir(),
  });
}
