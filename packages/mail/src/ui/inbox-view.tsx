import { Box, Text, useApp, useInput } from "ink";
import type { ReactNode } from "react";
import type { MessageSummary } from "../imap/messages.ts";
import { Brand } from "./brand.tsx";
import { renderUntilExit } from "./render.tsx";

function InboxApp({ messages }: { messages: MessageSummary[] }): ReactNode {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === "q") {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Brand subtitle={`INBOX (${messages.length})`} />
      {messages.length === 0 ? (
        <Text dimColor>No messages in INBOX.</Text>
      ) : (
        <Box flexDirection="column">
          {messages.map((item) => (
            <Box key={item.ref} flexDirection="column" marginBottom={1}>
              <Text>
                <Text color="cyan">{item.ref}</Text>
                <Text dimColor> · {item.seen ? "read" : "unread"}</Text>
              </Text>
              <Text>{item.subject ?? "(no subject)"}</Text>
              <Text dimColor>
                {item.from.join(", ")}
                {item.date ? ` · ${item.date}` : ""}
              </Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          Read via `proton mail get INBOX::uid` · q / Esc close
        </Text>
      </Box>
    </Box>
  );
}

export async function showInbox(messages: MessageSummary[]): Promise<void> {
  await renderUntilExit(<InboxApp messages={messages} />);
}
