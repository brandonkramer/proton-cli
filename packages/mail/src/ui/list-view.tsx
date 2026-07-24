import { Select } from "@inkjs/ui";
import { Box, Text, useApp, useInput } from "ink";
import type { ReactNode } from "react";
import type {
  DecryptedMessage,
  MessageSummary,
} from "../service/messages.ts";
import { Brand } from "./brand.tsx";
import { renderPrompt, renderUntilExit } from "./render.tsx";

function formatMessageLabel(message: MessageSummary): string {
  const date = new Date(message.time * 1000).toISOString().slice(0, 16);
  const unread = message.unread ? "*" : " ";
  const sender = message.senderName || message.senderEmail || "(unknown)";
  const subject = message.subject || "(no subject)";
  return `${unread} ${date}  ${sender}  ${subject}`;
}

function MessageListApp({
  title,
  messages,
}: {
  title: string;
  messages: MessageSummary[];
}): ReactNode {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === "q") {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Brand subtitle={`${title} (${messages.length})`} />
      {messages.length === 0 ? (
        <Text dimColor>No messages.</Text>
      ) : (
        <Box flexDirection="column">
          {messages.map((message) => (
            <Box key={message.id} gap={1}>
              <Text color={message.unread ? "cyan" : undefined}>
                {formatMessageLabel(message)}
              </Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>q / Esc close · CLI: `proton mail list --json`</Text>
      </Box>
    </Box>
  );
}

function MessageDetailApp({ message }: { message: DecryptedMessage }): ReactNode {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === "q") {
      exit();
    }
  });

  const from = message.senderName
    ? `${message.senderName} <${message.senderEmail}>`
    : message.senderEmail;

  return (
    <Box flexDirection="column">
      <Brand subtitle={message.subject || "(no subject)"} />
      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>From: {from}</Text>
        {message.to.length > 0 ? (
          <Text dimColor>To: {message.to.join(", ")}</Text>
        ) : null}
        {message.cc.length > 0 ? (
          <Text dimColor>Cc: {message.cc.join(", ")}</Text>
        ) : null}
        <Text dimColor>
          Time: {new Date(message.time * 1000).toISOString()}
        </Text>
        <Text dimColor>ID: {message.id}</Text>
      </Box>
      <Box flexDirection="column">
        <Text>{message.body || "(empty body)"}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>q / Esc close · CLI: `proton mail read {message.id}`</Text>
      </Box>
    </Box>
  );
}

export async function showMessageList(
  title: string,
  messages: MessageSummary[],
): Promise<void> {
  await renderUntilExit(<MessageListApp title={title} messages={messages} />);
}

export async function pickMessage(
  title: string,
  messages: MessageSummary[],
): Promise<string | null> {
  if (messages.length === 0) {
    await showMessageList(title, messages);
    return null;
  }

  return renderPrompt<string | null>(({ resolve }) => {
    function Picker(): ReactNode {
      const { exit } = useApp();

      useInput((input, key) => {
        if (key.escape || input === "q") {
          resolve(null);
          exit();
        }
      });

      const options = [
        ...messages.map((message) => ({
          label: formatMessageLabel(message),
          value: message.id,
        })),
        { label: "Back", value: "__back__" },
      ];

      return (
        <Box flexDirection="column">
          <Brand subtitle={`${title} — pick to read`} />
          <Select
            visibleOptionCount={10}
            options={options}
            onChange={(value) => {
              resolve(value === "__back__" ? null : value);
              exit();
            }}
          />
          <Box marginTop={1}>
            <Text dimColor>Esc/q cancel · enter to read</Text>
          </Box>
        </Box>
      );
    }

    return <Picker />;
  });
}

export async function showMessageDetail(message: DecryptedMessage): Promise<void> {
  await renderUntilExit(<MessageDetailApp message={message} />);
}
