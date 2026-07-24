import { Box, Text, useApp, useInput } from "ink";
import { StatusMessage } from "@inkjs/ui";
import type { ReactNode } from "react";
import { Brand } from "./brand.tsx";
import { renderUntilExit } from "./render.tsx";

function StatusApp({
  signedIn,
  username,
  calendarCount,
  eventCount,
  configDir,
}: {
  signedIn: boolean;
  username?: string;
  calendarCount: number;
  eventCount: number | null;
  configDir: string;
}): ReactNode {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === "q") {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Brand subtitle="Status" />
      <Box flexDirection="column" marginBottom={1}>
        <StatusMessage variant={signedIn ? "success" : "warning"}>
          {signedIn
            ? `Signed in as ${username}`
            : "Not signed in — use proton menu Sign in"}
        </StatusMessage>
        <StatusMessage variant={calendarCount > 0 ? "success" : "warning"}>
          {calendarCount > 0
            ? `${calendarCount} calendars`
            : "No calendars loaded"}
        </StatusMessage>
        {eventCount !== null ? (
          <StatusMessage variant={eventCount > 0 ? "success" : "warning"}>
            {eventCount > 0
              ? `${eventCount} events (30-day window)`
              : "No events in default window"}
          </StatusMessage>
        ) : (
          <StatusMessage variant="warning">
            Events not loaded — set PROTON_PASSWORD or use CLI with --password
          </StatusMessage>
        )}
        <Text dimColor>Config: {configDir}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>q / Esc close</Text>
      </Box>
    </Box>
  );
}

export async function showStatus(options: {
  signedIn: boolean;
  username?: string;
  calendarCount: number;
  eventCount: number | null;
  configDir: string;
}): Promise<void> {
  await renderUntilExit(
    <StatusApp
      signedIn={options.signedIn}
      username={options.username}
      calendarCount={options.calendarCount}
      eventCount={options.eventCount}
      configDir={options.configDir}
    />,
  );
}
