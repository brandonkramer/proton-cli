import { Select } from "@inkjs/ui";
import { Box, Text, useApp, useInput } from "ink";
import type { ReactNode } from "react";
import type {
  DecryptedMessage,
  MessageSummary,
} from "../service/messages.ts";
import { formatMessageBodyForDisplay } from "../util/html-to-text.ts";
import { Brand } from "./brand.tsx";
import { renderPrompt, renderUntilExit } from "./render.tsx";

export type MessageListParty = "from" | "to";

function formatMessageLabel(
  message: MessageSummary,
  party: MessageListParty = "from",
): string {
  const date = new Date(message.time * 1000).toISOString().slice(0, 16);
  const unread = message.unread ? "*" : " ";
  const subject = message.subject || "(no subject)";
  const partyLabel =
    party === "to"
      ? message.to.length > 0
        ? `→ ${message.to.join(", ")}`
        : "(no recipients)"
      : message.senderName || message.senderEmail || "(unknown)";
  return `${unread} ${date}  ${partyLabel}  ${subject}`;
}

function MessageListApp({
  title,
  messages,
  party = "from",
}: {
  title: string;
  messages: MessageSummary[];
  party?: MessageListParty;
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
                {formatMessageLabel(message, party)}
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

export type MessageDetailAction =
  | "close"
  | "reply"
  | "reply-all"
  | "forward";

function MessageDetailApp({
  message,
  onAction,
}: {
  message: DecryptedMessage;
  onAction: (action: MessageDetailAction) => void;
}): ReactNode {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onAction("close");
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
        <Text dimColor>
          Signed:{" "}
          {message.verified === true
            ? "verified"
            : message.verified === false
              ? "failed"
              : "unknown"}
        </Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          {formatMessageBodyForDisplay(message.body, message.mimeType) ||
            "(empty body)"}
        </Text>
      </Box>
      <Select
        visibleOptionCount={5}
        options={[
          { label: "Reply", value: "reply" },
          { label: "Reply all", value: "reply-all" },
          { label: "Forward", value: "forward" },
          { label: "Close", value: "close" },
        ]}
        onChange={(value) => {
          onAction(value as MessageDetailAction);
          exit();
        }}
      />
      <Box marginTop={1}>
        <Text dimColor>Esc/q close · enter to act</Text>
      </Box>
    </Box>
  );
}

export async function showMessageList(
  title: string,
  messages: MessageSummary[],
  party: MessageListParty = "from",
): Promise<void> {
  await renderUntilExit(
    <MessageListApp title={title} messages={messages} party={party} />,
  );
}

export async function pickMessage(
  title: string,
  messages: MessageSummary[],
  party: MessageListParty = "from",
): Promise<string | null> {
  if (messages.length === 0) {
    await showMessageList(title, messages, party);
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
          label: formatMessageLabel(message, party),
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

export async function showMessageDetail(
  message: DecryptedMessage,
): Promise<MessageDetailAction> {
  return renderPrompt<MessageDetailAction>(({ resolve }) => (
    <MessageDetailApp message={message} onAction={resolve} />
  ));
}
