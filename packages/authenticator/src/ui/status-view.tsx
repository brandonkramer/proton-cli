import { Box, Text, useApp } from "ink";
import { Alert, StatusMessage } from "@inkjs/ui";
import { useEffect, type ReactNode } from "react";
import { Brand } from "./brand.tsx";
import { renderUntilExit } from "./render.tsx";

export interface StatusInfo {
  signedIn: boolean;
  username?: string;
  entryCount: number;
  lastSyncAt: string | null;
  authenticatorKeyId: string | null;
  configDir: string;
}

function StatusApp({ info }: { info: StatusInfo }): ReactNode {
  const { exit } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => exit(), 1600);
    return () => clearTimeout(timer);
  }, [exit]);

  return (
    <Box flexDirection="column">
      <Brand subtitle="Status" />
      {info.signedIn ? (
        <StatusMessage variant="success">
          Signed in as {info.username}
        </StatusMessage>
      ) : (
        <StatusMessage variant="warning">Not signed in</StatusMessage>
      )}
      <Box flexDirection="column" marginTop={1}>
        <Text>
          Entries: <Text color="cyan">{info.entryCount}</Text>
        </Text>
        <Text>
          Authenticator key:{" "}
          <Text dimColor>
            {info.authenticatorKeyId ? "present (not stored plaintext)" : "none"}
          </Text>
        </Text>
        <Text>
          Last sync:{" "}
          <Text dimColor>{info.lastSyncAt ?? "never"}</Text>
        </Text>
        <Text dimColor>Config: {info.configDir}</Text>
      </Box>
      <Box marginTop={1}>
        <Alert variant="info" title="Unofficial">
          Third-party CLI — not affiliated with Proton AG.
        </Alert>
      </Box>
    </Box>
  );
}

export async function showStatus(info: StatusInfo): Promise<void> {
  await renderUntilExit(<StatusApp info={info} />);
}
