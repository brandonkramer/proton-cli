import { describe, expect, test } from "bun:test";
import type { ImapFlow, ListResponse } from "imapflow";
import { organizeMessage, organizeMessages } from "../src/imap/organize.ts";

interface MockOrganizeState {
  listEntries?: ListResponse[];
  messageMove?: (range: number[], destination: string) => void;
  messageFlagsAdd?: (range: number[], flags: string[]) => void;
  messageFlagsRemove?: (range: number[], flags: string[]) => void;
  messageDelete?: (range: number[]) => void;
}

function sampleListResponse(
  overrides: Partial<ListResponse> & Pick<ListResponse, "path" | "name">,
): ListResponse {
  return {
    pathAsListed: overrides.path,
    delimiter: "/",
    parent: [],
    parentPath: "",
    flags: new Set<string>(),
    listed: true,
    subscribed: true,
    ...overrides,
  };
}

function createOrganizeClient(state: MockOrganizeState = {}): ImapFlow {
  const lock = { release: () => undefined };
  return {
    list: async () =>
      state.listEntries ?? [
        sampleListResponse({ path: "INBOX", name: "INBOX", specialUse: "\\Inbox" }),
        sampleListResponse({ path: "Archive", name: "Archive", specialUse: "\\Archive" }),
        sampleListResponse({ path: "Trash", name: "Trash", specialUse: "\\Trash" }),
      ],
    getMailboxLock: async () => lock,
    messageMove: async (range: number[] | string, destination: string) => {
      state.messageMove?.(range as number[], destination);
      return { destination, uidMap: new Map() };
    },
    messageFlagsAdd: async (range: number[] | string, flags: string[]) => {
      state.messageFlagsAdd?.(range as number[], flags);
      return true;
    },
    messageFlagsRemove: async (range: number[] | string, flags: string[]) => {
      state.messageFlagsRemove?.(range as number[], flags);
      return true;
    },
    messageDelete: async (range: number[] | string) => {
      state.messageDelete?.(range as number[]);
      return true;
    },
  } as unknown as ImapFlow;
}

describe("organizeMessage dry-run", () => {
  test("does not mutate mailboxes", async () => {
    let moved = false;
    const client = createOrganizeClient({
      messageMove: () => {
        moved = true;
      },
    });

    const result = await organizeMessage(
      client,
      { mailbox: "INBOX", uid: 42 },
      "archive",
      { dryRun: true },
    );

    expect(result.dryRun).toBe(true);
    expect(result.destination).toBe("Archive");
    expect(moved).toBe(false);
  });

  test("previews flag changes without store", async () => {
    let flagged = false;
    const client = createOrganizeClient({
      messageFlagsAdd: () => {
        flagged = true;
      },
    });

    const result = await organizeMessage(
      client,
      { mailbox: "INBOX", uid: 7 },
      "star",
      { dryRun: true },
    );

    expect(result.flags).toEqual(["\\Flagged"]);
    expect(flagged).toBe(false);
  });
});

describe("organizeMessage live", () => {
  test("moves message to destination mailbox", async () => {
    const moves: Array<{ range: number[]; destination: string }> = [];
    const client = createOrganizeClient({
      messageMove: (range, destination) => {
        moves.push({ range, destination });
      },
    });

    const result = await organizeMessage(
      client,
      { mailbox: "INBOX", uid: 99 },
      "move",
      { destination: "Archive" },
    );

    expect(result.dryRun).toBe(false);
    expect(result.destination).toBe("Archive");
    expect(moves).toEqual([{ range: [99], destination: "Archive" }]);
  });

  test("marks message read via IMAP STORE", async () => {
    const added: Array<{ range: number[]; flags: string[] }> = [];
    const client = createOrganizeClient({
      messageFlagsAdd: (range, flags) => {
        added.push({ range, flags });
      },
    });

    await organizeMessage(client, { mailbox: "INBOX", uid: 5 }, "mark-read");
    expect(added).toEqual([{ range: [5], flags: ["\\Seen"] }]);
  });

  test("deletes message via IMAP EXPUNGE", async () => {
    const deleted: number[][] = [];
    const client = createOrganizeClient({
      messageDelete: (range) => {
        deleted.push(range);
      },
    });

    await organizeMessage(client, { mailbox: "INBOX", uid: 12 }, "delete");
    expect(deleted).toEqual([[12]]);
  });
});

describe("organizeMessages batch", () => {
  test("applies action to each ref", async () => {
    const trashed: number[][] = [];
    const client = createOrganizeClient({
      messageMove: (range) => {
        trashed.push(range);
      },
    });

    const result = await organizeMessages(
      client,
      [
        { mailbox: "INBOX", uid: 1 },
        { mailbox: "INBOX", uid: 2 },
      ],
      "trash",
    );

    expect(result.results).toHaveLength(2);
    expect(trashed).toEqual([[1], [2]]);
  });

  test("batch dry-run does not mutate", async () => {
    let moved = false;
    const client = createOrganizeClient({
      messageMove: () => {
        moved = true;
      },
    });

    const result = await organizeMessages(
      client,
      [
        { mailbox: "INBOX", uid: 3 },
        { mailbox: "INBOX", uid: 4 },
      ],
      "archive",
      { dryRun: true },
    );

    expect(result.dryRun).toBe(true);
    expect(result.results.every((item) => item.dryRun)).toBe(true);
    expect(moved).toBe(false);
  });
});
