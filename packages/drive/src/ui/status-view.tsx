import { Box, Text, useApp, useInput } from "ink";
import { StatusMessage } from "@inkjs/ui";
import type { ReactNode } from "react";
import { Brand } from "./brand.tsx";
import { renderUntilExit } from "./render.tsx";

function StatusApp({
  signedIn,
  username,
  itemCount,
  trashCount,
  configDir,
}: {
  signedIn: boolean;
  username?: string;
  itemCount: number | null;
  trashCount: number | null;
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
        <StatusMessage
          variant={itemCount !== null && itemCount > 0 ? "success" : "warning"}
        >
          {itemCount === null
            ? "Root folder not loaded"
            : itemCount > 0
              ? `${itemCount} items in /`
              : "Root folder empty"}
        </StatusMessage>
        <StatusMessage
          variant={trashCount !== null && trashCount > 0 ? "success" : "warning"}
        >
          {trashCount === null
            ? "Trash not loaded"
            : trashCount > 0
              ? `${trashCount} items in trash`
              : "Trash empty"}
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
  itemCount: number | null;
  trashCount: number | null;
  configDir: string;
}): Promise<void> {
  await renderUntilExit(
    <StatusApp
      signedIn={options.signedIn}
      username={options.username}
      itemCount={options.itemCount}
      trashCount={options.trashCount}
      configDir={options.configDir}
    />,
  );
}
