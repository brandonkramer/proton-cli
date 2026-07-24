import { configDir } from "../config/paths.ts";
import { loadSession, signOut } from "../proton/auth.ts";
import { listCalendars } from "../service/calendars.ts";
import { defaultRange, listEvents, resolveCalendarId } from "../service/events.ts";
import { showMessage } from "../ui/message.tsx";
import { showCalendarList, showEventList } from "../ui/list-view.tsx";
import { showStatus } from "../ui/status-view.tsx";
import { runTask } from "../ui/task.tsx";
import { resolveAccountPassword } from "../util/password.ts";
import { requireSession } from "../util/session.ts";

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
