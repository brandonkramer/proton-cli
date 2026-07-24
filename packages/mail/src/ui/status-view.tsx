import { Box, Text, useApp, useInput } from "ink";
import { StatusMessage } from "@inkjs/ui";
import type { ReactNode } from "react";
import { Brand } from "./brand.tsx";
import { renderUntilExit } from "./render.tsx";

function StatusApp({
  signedIn,
  username,
  inboxCount,
  inboxTotal,
  configDir,
}: {
  signedIn: boolean;
  username?: string;
  inboxCount: number | null;
  inboxTotal: number | null;
  configDir: string;
}): ReactNode {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === "q") {
      exit();
    }
  });

  const inboxLabel =
    inboxTotal === null
      ? "Inbox count unavailable"
      : inboxTotal > 0
        ? `${inboxTotal} message${inboxTotal === 1 ? "" : "s"} in inbox`
        : "Inbox empty";

  return (
    <Box flexDirection="column">
      <Brand subtitle="Status" />
      <Box flexDirection="column" marginBottom={1}>
        <StatusMessage variant={signedIn ? "success" : "warning"}>
          {signedIn
            ? `Signed in as ${username}`
            : "Not signed in — use proton menu Sign in"}
        </StatusMessage>
        <StatusMessage
          variant={
            inboxCount !== null && inboxCount > 0 ? "success" : "warning"
          }
        >
          {inboxLabel}
        </StatusMessage>
        <Text dimColor>Config: {configDir}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          q / Esc close · CLI: `proton mail list` / `proton mail read ID`
        </Text>
      </Box>
    </Box>
  );
}

export async function showStatus(options: {
  signedIn: boolean;
  username?: string;
  inboxCount: number | null;
  inboxTotal: number | null;
  configDir: string;
}): Promise<void> {
  await renderUntilExit(
    <StatusApp
      signedIn={options.signedIn}
      username={options.username}
      inboxCount={options.inboxCount}
      inboxTotal={options.inboxTotal}
      configDir={options.configDir}
    />,
  );
}
