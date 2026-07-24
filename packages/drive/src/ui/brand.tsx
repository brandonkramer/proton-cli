import { Box, Text } from "ink";
import type { ReactNode } from "react";

export function Brand({ subtitle }: { subtitle?: string }): ReactNode {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        Proton Drive
      </Text>
      <Text dimColor>proton-cli · E2EE files · not affiliated with Proton AG</Text>
      {subtitle ? <Text color="white">{subtitle}</Text> : null}
    </Box>
  );
}
