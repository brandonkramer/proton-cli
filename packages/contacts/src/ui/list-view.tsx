import { Box, Text, useApp, useInput } from "ink";
import type { ReactNode } from "react";
import type { ContactGroupSummary, ContactSummary } from "../proton/client.ts";
import { Brand } from "./brand.tsx";
import { renderUntilExit } from "./render.tsx";

function ContactListApp({ contacts }: { contacts: ContactSummary[] }): ReactNode {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === "q") {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Brand subtitle={`Contacts (${contacts.length})`} />
      {contacts.length === 0 ? (
        <Text dimColor>
          No contacts. Use `proton contacts create` or sign in first.
        </Text>
      ) : (
        <Box flexDirection="column">
          {contacts.map((contact) => (
            <Box key={contact.id} gap={1}>
              <Text color="cyan">{contact.name || "(unnamed)"}</Text>
              {contact.email ? <Text dimColor>{contact.email}</Text> : null}
              {contact.phone ? <Text dimColor>{contact.phone}</Text> : null}
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>q / Esc close · CLI: `proton contacts list --json`</Text>
      </Box>
    </Box>
  );
}

function GroupListApp({ groups }: { groups: ContactGroupSummary[] }): ReactNode {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === "q") {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Brand subtitle={`Groups (${groups.length})`} />
      {groups.length === 0 ? (
        <Text dimColor>No groups yet.</Text>
      ) : (
        <Box flexDirection="column">
          {groups.map((group) => (
            <Box key={group.id} gap={1}>
              <Text color="cyan">{group.name}</Text>
              <Text dimColor>{group.color}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>q / Esc close · CLI: `proton contacts groups list --json`</Text>
      </Box>
    </Box>
  );
}

export async function showContactList(contacts: ContactSummary[]): Promise<void> {
  await renderUntilExit(<ContactListApp contacts={contacts} />);
}

export async function showGroupList(groups: ContactGroupSummary[]): Promise<void> {
  await renderUntilExit(<GroupListApp groups={groups} />);
}
