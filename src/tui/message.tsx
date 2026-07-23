import { Box, useApp } from "ink";
import { Alert } from "@inkjs/ui";
import { useEffect, type ReactNode } from "react";
import { Brand } from "./brand.tsx";
import { renderPrompt } from "./render.tsx";

export async function showMessage(options: {
  title: string;
  variant: "success" | "error" | "info" | "warning";
  body?: string;
  holdMs?: number;
}): Promise<void> {
  const holdMs = options.holdMs ?? 900;
  await renderPrompt<void>(({ resolve }) => {
    function MessageApp(): ReactNode {
      const { exit } = useApp();
      useEffect(() => {
        const timer = setTimeout(() => {
          resolve();
          exit();
        }, holdMs);
        return () => clearTimeout(timer);
      }, [exit]);
      return (
        <Box flexDirection="column">
          <Brand />
          <Alert variant={options.variant} title={options.title}>
            {options.body ?? ""}
          </Alert>
        </Box>
      );
    }
    return <MessageApp />;
  });
}
