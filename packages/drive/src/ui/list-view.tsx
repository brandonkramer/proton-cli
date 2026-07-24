import { Box, Text, useApp, useInput } from "ink";
import type { ReactNode } from "react";
import type { DriveChild, TrashEntry } from "../drive/types.ts";
import { Brand } from "./brand.tsx";
import { renderUntilExit } from "./render.tsx";

function ItemListApp({
  path,
  items,
}: {
  path: string;
  items: DriveChild[];
}): ReactNode {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === "q") {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Brand subtitle={`Items in ${path} (${items.length})`} />
      {items.length === 0 ? (
        <Text dimColor>
          No items. Use `proton drive items upload` or sign in first.
        </Text>
      ) : (
        <Box flexDirection="column">
          {items.map((item) => (
            <Box key={item.linkId} gap={1}>
              <Text color="cyan">{item.name}</Text>
              <Text dimColor>{item.type === 1 ? "folder" : "file"}</Text>
              <Text dimColor>{item.size}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>q / Esc close · CLI: `proton drive items list --json`</Text>
      </Box>
    </Box>
  );
}

function TrashListApp({ items }: { items: TrashEntry[] }): ReactNode {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.escape || input === "q") {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <Brand subtitle={`Trash (${items.length})`} />
      {items.length === 0 ? (
        <Text dimColor>Trash is empty.</Text>
      ) : (
        <Box flexDirection="column">
          {items.map((item) => (
            <Box key={item.linkId} gap={1}>
              <Text color="cyan">{item.linkId}</Text>
              <Text dimColor>{item.type === 1 ? "folder" : "file"}</Text>
              <Text dimColor>{item.size}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>q / Esc close · CLI: `proton drive trash list --json`</Text>
      </Box>
    </Box>
  );
}

export async function showItemList(
  path: string,
  items: DriveChild[],
): Promise<void> {
  await renderUntilExit(<ItemListApp path={path} items={items} />);
}

export async function showTrashList(items: TrashEntry[]): Promise<void> {
  await renderUntilExit(<TrashListApp items={items} />);
}
