import { Box, Text } from "ink";
import type { ReactNode } from "react";

export function Brand({ subtitle }: { subtitle?: string }): ReactNode {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        proton-cli
      </Text>
      <Text dimColor>
        Unofficial · VPN · Authenticator · Contacts · Calendar · Drive · Settings · Mail
      </Text>
      {subtitle ? <Text color="white">{subtitle}</Text> : null}
    </Box>
  );
}
