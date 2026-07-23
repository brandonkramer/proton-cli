import { Select } from "@inkjs/ui";
import { Box, Text, useApp, useInput } from "ink";
import { useMemo, type ReactNode } from "react";
import { loadLocalEntries, loadSession } from "../config/store.ts";
import { Brand } from "../ui/brand.tsx";
import { renderPrompt } from "../ui/render.tsx";

export type TuiIntent =
  | { type: "quit" }
  | { type: "signin" }
  | { type: "signout" }
  | { type: "sync" }
  | { type: "list" }
  | { type: "code" }
  | { type: "status" };

const MENU: Array<{
  value: string;
  label: string;
  shortcut: string;
  intent: TuiIntent;
}> = [
  { value: "signin", shortcut: "1", label: "Sign in", intent: { type: "signin" } },
  { value: "sync", shortcut: "2", label: "Sync", intent: { type: "sync" } },
  {
    value: "list",
    shortcut: "3",
    label: "List entries",
    intent: { type: "list" },
  },
  { value: "code", shortcut: "4", label: "Get code", intent: { type: "code" } },
  { value: "status", shortcut: "5", label: "Status", intent: { type: "status" } },
  {
    value: "signout",
    shortcut: "6",
    label: "Sign out",
    intent: { type: "signout" },
  },
  { value: "quit", shortcut: "q", label: "Quit", intent: { type: "quit" } },
];

function HomeApp({
  username,
  entryCount,
  onPick,
}: {
  username: string | null;
  entryCount: number;
  onPick: (intent: TuiIntent) => void;
}): ReactNode {
  const { exit } = useApp();

  const options = useMemo(
    () =>
      MENU.map((item) => ({
        label: `${item.label}  (${item.shortcut})`,
        value: item.value,
      })),
    [],
  );

  const pick = (value: string) => {
    const item = MENU.find((m) => m.value === value);
    if (!item) return;
    onPick(item.intent);
    exit();
  };

  // Number / q shortcuts still work alongside ↑↓ + Enter.
  useInput((input, key) => {
    if (key.escape) {
      pick("quit");
      return;
    }
    const shortcut = input.toLowerCase();
    const item = MENU.find((m) => m.shortcut === shortcut);
    if (item) pick(item.value);
  });

  return (
    <Box flexDirection="column">
      <Brand subtitle="Interactive menu" />
      <Text>
        Session:{" "}
        {username ? (
          <Text color="green">{username}</Text>
        ) : (
          <Text color="yellow">not signed in</Text>
        )}
        {" · "}
        Entries: <Text color="cyan">{entryCount}</Text>
      </Text>
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Select
          options={options}
          visibleOptionCount={MENU.length}
          onChange={pick}
        />
      </Box>
      <Text dimColor>↑↓ move · Enter select · 1–6 / q shortcuts · Esc quit</Text>
      <Text dimColor>
        Unofficial third-party CLI — not affiliated with Proton AG.
      </Text>
    </Box>
  );
}

export async function showHome(): Promise<TuiIntent> {
  const session = await loadSession();
  const local = await loadLocalEntries();
  return renderPrompt<TuiIntent>(({ resolve }) => (
    <HomeApp
      username={session?.username ?? null}
      entryCount={local.entries.filter(
        (e) => e.syncState !== "PendingToDelete",
      ).length}
      onPick={resolve}
    />
  ));
}
