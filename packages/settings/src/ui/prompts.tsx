import { Box, Text } from "ink";
import { TextInput } from "@inkjs/ui";
import type { ReactNode } from "react";
import { Brand } from "./brand.tsx";
import { renderPrompt } from "./render.tsx";

function PromptFrame({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <Box flexDirection="column">
      <Brand subtitle={title} />
      {hint ? (
        <Box marginBottom={1}>
          <Text dimColor>{hint}</Text>
        </Box>
      ) : null}
      {children}
    </Box>
  );
}

export async function inkPromptText(
  label: string,
  options: { placeholder?: string; defaultValue?: string; hint?: string } = {},
): Promise<string> {
  return renderPrompt<string>(({ resolve, reject }) => (
    <PromptFrame title={label} hint={options.hint}>
      <Box flexDirection="column">
        <Text>
          <Text color="cyan">› </Text>
          {label}
        </Text>
        <TextInput
          placeholder={options.placeholder ?? ""}
          defaultValue={options.defaultValue}
          onSubmit={(value) => {
            const trimmed = value.trim();
            if (!trimmed) {
              reject(new Error(`${label} is required.`));
              return;
            }
            resolve(trimmed);
          }}
        />
      </Box>
    </PromptFrame>
  ));
}
