import { Box, Text, useApp, useInput } from "ink";
import type { ReactNode } from "react";
import type { CalendarSummary } from "../service/calendars.ts";
import type { EventSummary } from "../service/events.ts";
import { Brand } from "./brand.tsx";
import { renderUntilExit } from "./render.tsx";

function CalendarListApp({
  calendars,
}: {
  calendars: CalendarSummary[];
}): ReactNode {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === "q") {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Brand subtitle={`Calendars (${calendars.length})`} />
      {calendars.length === 0 ? (
        <Text dimColor>
          No calendars. Use `proton calendar calendars create` or sign in first.
        </Text>
      ) : (
        <Box flexDirection="column">
          {calendars.map((cal) => (
            <Box key={cal.id} gap={1}>
              <Text color="cyan">{cal.name || "(unnamed)"}</Text>
              <Text dimColor>{cal.color}</Text>
              <Text dimColor>{cal.id}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>q / Esc close · CLI: `proton calendar calendars list --json`</Text>
      </Box>
    </Box>
  );
}

function EventListApp({ events }: { events: EventSummary[] }): ReactNode {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === "q") {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Brand subtitle={`Events (${events.length})`} />
      {events.length === 0 ? (
        <Text dimColor>No events in the default 30-day window.</Text>
      ) : (
        <Box flexDirection="column">
          {events.map((event) => {
            const start = new Date(event.start);
            const date = start.toISOString().slice(0, 10);
            const time = event.allDay
              ? "all-day"
              : start.toISOString().slice(11, 16);
            return (
              <Box key={`${event.calendarId}:${event.id}`} gap={1}>
                <Text dimColor>{date}</Text>
                <Text dimColor>{time}</Text>
                <Text color="cyan">{event.title || "(untitled)"}</Text>
              </Box>
            );
          })}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>q / Esc close · CLI: `proton calendar events list --json`</Text>
      </Box>
    </Box>
  );
}

export async function showCalendarList(
  calendars: CalendarSummary[],
): Promise<void> {
  await renderUntilExit(<CalendarListApp calendars={calendars} />);
}

export async function showEventList(events: EventSummary[]): Promise<void> {
  await renderUntilExit(<EventListApp events={events} />);
}
