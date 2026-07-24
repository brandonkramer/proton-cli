import { Box, Text, useApp, useInput } from "ink";
import type { ReactNode } from "react";
import { Brand } from "./brand.tsx";
import { renderUntilExit } from "./render.tsx";

function TextViewApp({
  title,
  body,
  footer,
}: {
  title: string;
  body: string;
  footer?: string;
}): ReactNode {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === "q") {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Brand subtitle={title} />
      <Box flexDirection="column" marginBottom={1}>
        {body.split("\n").map((line, index) => (
          <Text key={`${index}-${line}`}>{line || " "}</Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{footer ?? "q / Esc close"}</Text>
      </Box>
    </Box>
  );
}

export async function showTextView(options: {
  title: string;
  body: string;
  footer?: string;
}): Promise<void> {
  await renderUntilExit(
    <TextViewApp
      title={options.title}
      body={options.body}
      footer={options.footer}
    />,
  );
}
