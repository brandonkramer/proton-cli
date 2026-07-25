import { Box, Text, useApp, useInput } from "ink";
import { Select, TextInput } from "@inkjs/ui";
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

export async function inkPromptOptionalText(
  label: string,
  options: { placeholder?: string; defaultValue?: string; hint?: string } = {},
): Promise<string> {
  return renderPrompt<string>(({ resolve }) => (
    <PromptFrame title={label} hint={options.hint}>
      <Box flexDirection="column">
        <Text>
          <Text color="cyan">› </Text>
          {label}
        </Text>
        <TextInput
          placeholder={options.placeholder ?? "(optional)"}
          defaultValue={options.defaultValue}
          onSubmit={(value) => resolve(value.trim())}
        />
      </Box>
    </PromptFrame>
  ));
}

export async function inkPromptSelect(
  title: string,
  options: Array<{ label: string; value: string }>,
  footer = "Esc/q cancel",
): Promise<string | null> {
  return renderPrompt<string | null>(({ resolve }) => {
    function Picker(): ReactNode {
      const { exit } = useApp();

      useInput((input, key) => {
        if (key.escape || input === "q") {
          resolve(null);
          exit();
        }
      });

      return (
        <PromptFrame title={title}>
          <Select
            visibleOptionCount={Math.min(10, options.length)}
            options={options}
            onChange={(value) => {
              resolve(value);
              exit();
            }}
          />
          <Box marginTop={1}>
            <Text dimColor>{footer}</Text>
          </Box>
        </PromptFrame>
      );
    }

    return <Picker />;
  });
}
