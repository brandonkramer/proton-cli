import { describe, expect, test } from "bun:test";
import type { FetchMessageObject, ImapFlow, ListResponse } from "imapflow";
import {
  deleteDraftMessage,
  listDraftMessages,
  readDraftMessage,
  saveDraftMessage,
  sendDraftMessage,
} from "../src/imap/drafts.ts";

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

function sampleSource() {
  return Buffer.from(
    [
      "From: me@example.com",
      "To: bob@example.com",
      "Subject: Draft note",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Hello draft",
    ].join("\r\n"),
    "utf8",
  );
}

interface MockDraftState {
  append?: (mailbox: string, content: Buffer, flags: string[]) => void;
  messageDelete?: (range: number[]) => void;
  fetchOne?: FetchMessageObject | false;
  uids?: number[];
  fetchRows?: FetchMessageObject[];
}

function createDraftClient(state: MockDraftState = {}): ImapFlow {
  const lock = { release: () => undefined };
  return {
    list: async () => [
      sampleListResponse({ path: "Drafts", name: "Drafts", specialUse: "\\Drafts" }),
    ],
    search: async () => state.uids ?? [10, 11],
    fetchAll: async () =>
      state.fetchRows ?? [
        {
          uid: 11,
          envelope: {
            subject: "Draft note",
            from: [{ name: "Me", address: "me@example.com" }],
            to: [{ name: "Bob", address: "bob@example.com" }],
            date: new Date("2026-07-24T12:00:00.000Z"),
          },
          flags: new Set(["\\Draft"]),
          internalDate: new Date("2026-07-24T12:00:00.000Z"),
          size: 120,
        },
      ],
    fetchOne: async () =>
      state.fetchOne ?? {
        uid: 10,
        envelope: {
          subject: "Draft note",
          from: [{ name: "Me", address: "me@example.com" }],
          to: [{ name: "Bob", address: "bob@example.com" }],
          date: new Date("2026-07-24T12:00:00.000Z"),
        },
        flags: new Set(["\\Draft"]),
        source: sampleSource(),
      },
    append: async (_mailbox: string, content: Buffer, flags: string[]) => {
      state.append?.(_mailbox, content, flags);
      return { uid: 99, seq: 1 };
    },
    messageDelete: async (range: number[] | string) => {
      state.messageDelete?.(range as number[]);
      return true;
    },
    getMailboxLock: async () => lock,
  } as unknown as ImapFlow;
}

describe("listDraftMessages", () => {
  test("lists from Drafts special-use mailbox", async () => {
    const client = createDraftClient();
    const items = await listDraftMessages(client, 5);
    expect(items).toHaveLength(1);
    expect(items[0]?.mailbox).toBe("Drafts");
    expect(items[0]?.ref).toBe("Drafts::11");
  });
});

describe("readDraftMessage", () => {
  test("reads draft body from Drafts mailbox", async () => {
    const client = createDraftClient();
    const draft = await readDraftMessage(client, 10);
    expect(draft.ref).toBe("Drafts::10");
    expect(draft.text).toBe("Hello draft");
  });
});

describe("saveDraftMessage dry-run", () => {
  test("does not append to IMAP", async () => {
    let appended = false;
    const client = createDraftClient({
      append: () => {
        appended = true;
      },
    });

    const result = await saveDraftMessage(
      client,
      {
        from: "me@example.com",
        to: ["bob@example.com"],
        subject: "New draft",
        body: "Body",
      },
      { dryRun: true },
    );

    expect(result.dryRun).toBe(true);
    expect(result.mailbox).toBe("Drafts");
    expect(appended).toBe(false);
  });
});

describe("saveDraftMessage live", () => {
  test("appends draft with \\Draft flag", async () => {
    const appends: Array<{ mailbox: string; flags: string[] }> = [];
    const client = createDraftClient({
      append: (mailbox, _content, flags) => {
        appends.push({ mailbox, flags });
      },
    });

    const result = await saveDraftMessage(client, {
      from: "me@example.com",
      to: ["bob@example.com"],
      subject: "Saved",
      body: "Body",
    });

    expect(result.dryRun).toBe(false);
    expect(result.ref).toBe("Drafts::99");
    expect(appends).toHaveLength(1);
    expect(appends[0]?.mailbox).toBe("Drafts");
    expect(appends[0]?.flags).toEqual(["\\Draft"]);
  });

  test("updates existing draft by deleting old uid", async () => {
    const deleted: number[] = [];
    const client = createDraftClient({
      messageDelete: (range) => {
        deleted.push(...range);
      },
    });

    const result = await saveDraftMessage(
      client,
      {
        from: "me@example.com",
        to: ["bob@example.com"],
        subject: "Updated",
        body: "Body",
      },
      { updateRef: { mailbox: "Drafts", uid: 10 } },
    );

    expect(result.updated).toBe("Drafts::10");
    expect(deleted).toEqual([10]);
  });
});

describe("deleteDraftMessage", () => {
  test("dry-run does not delete", async () => {
    let deleted = false;
    const client = createDraftClient({
      messageDelete: () => {
        deleted = true;
      },
    });

    const result = await deleteDraftMessage(
      client,
      { mailbox: "Drafts", uid: 10 },
      { dryRun: true },
    );

    expect(result.dryRun).toBe(true);
    expect(deleted).toBe(false);
  });

  test("deletes draft uid", async () => {
    const deleted: number[] = [];
    const client = createDraftClient({
      messageDelete: (range) => {
        deleted.push(...range);
      },
    });

    const result = await deleteDraftMessage(client, { mailbox: "Drafts", uid: 10 });
    expect(result.dryRun).toBe(false);
    expect(deleted).toEqual([10]);
  });
});

describe("sendDraftMessage", () => {
  test("dry-run does not delete draft", async () => {
    let deleted = false;
    const client = createDraftClient({
      messageDelete: () => {
        deleted = true;
      },
    });

    const result = await sendDraftMessage(
      client,
      { mailbox: "Drafts", uid: 10 },
      { dryRun: true, from: "me@example.com" },
    );

    expect(result.dryRun).toBe(true);
    expect(result.deliver.preview.to).toEqual(["bob@example.com"]);
    expect(result.deleted).toBe(false);
    expect(deleted).toBe(false);
  });
});
