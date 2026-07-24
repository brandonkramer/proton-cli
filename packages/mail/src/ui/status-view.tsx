import { Box, Text, useApp } from "ink";
import { Alert, StatusMessage } from "@inkjs/ui";
import { useEffect, type ReactNode } from "react";
import type { buildStatusPayload } from "../commands/status.ts";
import { Brand } from "./brand.tsx";
import { renderUntilExit } from "./render.tsx";

export type StatusInfo = ReturnType<typeof buildStatusPayload>;

function StatusApp({ info }: { info: StatusInfo }): ReactNode {
  const { exit } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => exit(), 1800);
    return () => clearTimeout(timer);
  }, [exit]);

  return (
    <Box flexDirection="column">
      <Brand subtitle="Status" />
      <StatusMessage variant={info.ok ? "success" : "warning"}>
        {info.ok
          ? "Bridge settings ready"
          : info.configured
            ? "Configured — password or Bridge missing"
            : "Not configured — run Setup"}
      </StatusMessage>
      <Box flexDirection="column" marginTop={1}>
        <Text>
          Username: <Text color="cyan">{info.username ?? "—"}</Text>
        </Text>
        <Text>
          IMAP:{" "}
          <Text dimColor>
            {info.imap
              ? `${info.imap.host}:${info.imap.port} tls=${info.imap.tls}`
              : "missing"}
          </Text>
        </Text>
        <Text>
          SMTP:{" "}
          <Text dimColor>
            {info.smtp
              ? `${info.smtp.host}:${info.smtp.port} tls=${info.smtp.tls}`
              : "missing"}
          </Text>
        </Text>
        <Text>
          Password:{" "}
          <Text dimColor>
            {info.password.configured
              ? info.password.source
              : "missing (set PROTONMAIL_PASSWORD or setup Pass/file)"}
          </Text>
        </Text>
        <Text dimColor>Config: {info.configDir}</Text>
      </Box>
      <Box marginTop={1}>
        <Alert variant="info" title="Bridge password">
          Use the Bridge app password from Bridge → Settings — not your Proton
          account password.
        </Alert>
      </Box>
    </Box>
  );
}

export async function showStatus(info: StatusInfo): Promise<void> {
  await renderUntilExit(<StatusApp info={info} />);
}
