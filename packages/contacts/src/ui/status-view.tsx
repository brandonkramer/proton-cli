import { Box, Text, useApp, useInput } from "ink";
import { StatusMessage } from "@inkjs/ui";
import type { ReactNode } from "react";
import { Brand } from "./brand.tsx";
import { renderUntilExit } from "./render.tsx";

function StatusApp({
  signedIn,
  username,
  contactCount,
  groupCount,
  configDir,
}: {
  signedIn: boolean;
  username?: string;
  contactCount: number;
  groupCount: number;
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
        <StatusMessage variant={contactCount > 0 ? "success" : "warning"}>
          {contactCount > 0
            ? `${contactCount} contacts`
            : "No contacts loaded"}
        </StatusMessage>
        <StatusMessage variant={groupCount > 0 ? "success" : "warning"}>
          {groupCount > 0 ? `${groupCount} groups` : "No groups"}
        </StatusMessage>
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
  contactCount: number;
  groupCount: number;
  configDir: string;
}): Promise<void> {
  await renderUntilExit(
    <StatusApp
      signedIn={options.signedIn}
      username={options.username}
      contactCount={options.contactCount}
      groupCount={options.groupCount}
      configDir={options.configDir}
    />,
  );
}
