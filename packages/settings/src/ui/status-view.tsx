import { Box, Text, useApp, useInput } from "ink";
import { StatusMessage } from "@inkjs/ui";
import type { ReactNode } from "react";
import { Brand } from "./brand.tsx";
import { renderUntilExit } from "./render.tsx";

function StatusApp({
  signedIn,
  username,
  writableKeyCount,
  configDir,
}: {
  signedIn: boolean;
  username?: string;
  writableKeyCount: number;
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
        <StatusMessage variant={writableKeyCount > 0 ? "success" : "warning"}>
          {writableKeyCount > 0
            ? `${writableKeyCount} writable mail settings`
            : "No writable keys loaded"}
        </StatusMessage>
        <Text dimColor>API: account + mail preferences (not Bridge)</Text>
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
  writableKeyCount: number;
  configDir: string;
}): Promise<void> {
  await renderUntilExit(
    <StatusApp
      signedIn={options.signedIn}
      username={options.username}
      writableKeyCount={options.writableKeyCount}
      configDir={options.configDir}
    />,
  );
}
