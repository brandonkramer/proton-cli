import { Box, Text } from "ink";
import { PasswordInput, TextInput } from "@inkjs/ui";
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
  options: { placeholder?: string; hint?: string } = {},
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

export async function inkPromptPassword(label: string): Promise<string> {
  return renderPrompt<string>(({ resolve, reject }) => (
    <PromptFrame title={label}>
      <Box flexDirection="column">
        <Text>
          <Text color="cyan">› </Text>
          {label}
        </Text>
        <PasswordInput
          onSubmit={(value) => {
            if (!value) {
              reject(new Error(`${label} is required.`));
              return;
            }
            resolve(value);
          }}
        />
      </Box>
    </PromptFrame>
  ));
}

/** Optional TOTP — empty submit returns "". */
export async function inkPromptTotp(
  title = "TOTP code",
  hint = "Leave empty if 2FA is not enabled",
): Promise<string> {
  return renderPrompt<string>(({ resolve }) => (
    <PromptFrame title={title} hint={hint}>
      <Box flexDirection="column">
        <Text>
          <Text color="cyan">› </Text>
          {title}
        </Text>
        <TextInput
          placeholder="6-digit code (optional)"
          onSubmit={(value) => resolve(value.trim())}
        />
      </Box>
    </PromptFrame>
  ));
}
