import { describe, expect, test } from "bun:test";
import type { ImapFlow, ListResponse } from "imapflow";
import {
  findSpecialMailbox,
  listMailFolders,
  type FolderSummary,
} from "../src/imap/folders.ts";

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

function createListClient(entries: ListResponse[]): ImapFlow {
  return {
    list: async () => entries,
  } as unknown as ImapFlow;
}

describe("listMailFolders", () => {
  test("returns sorted folder summaries with status", async () => {
    const client = createListClient([
      sampleListResponse({
        path: "INBOX",
        name: "INBOX",
        specialUse: "\\Inbox",
        status: { path: "INBOX", messages: 10, unseen: 2 },
      }),
      sampleListResponse({
        path: "Archive",
        name: "Archive",
        specialUse: "\\Archive",
        status: { path: "Archive", messages: 3, unseen: 0 },
      }),
    ]);

    const folders = await listMailFolders(client);
    expect(folders.map((folder) => folder.path)).toEqual(["Archive", "INBOX"]);
    expect(folders[1]?.messages).toBe(10);
    expect(folders[1]?.unseen).toBe(2);
    expect(folders[1]?.specialUse).toBe("\\Inbox");
  });
});

describe("findSpecialMailbox", () => {
  const folders: FolderSummary[] = [
    {
      path: "INBOX",
      name: "INBOX",
      delimiter: "/",
      parentPath: "",
      specialUse: "\\Inbox",
      flags: [],
      subscribed: true,
      messages: null,
      unseen: null,
    },
    {
      path: "All Mail",
      name: "All Mail",
      delimiter: "/",
      parentPath: "",
      specialUse: "\\All",
      flags: [],
      subscribed: true,
      messages: null,
      unseen: null,
    },
    {
      path: "Trash",
      name: "Trash",
      delimiter: "/",
      parentPath: "",
      specialUse: "\\Trash",
      flags: [],
      subscribed: true,
      messages: null,
      unseen: null,
    },
  ];

  test("prefers special-use flags", () => {
    expect(findSpecialMailbox(folders, "archive")).toBe("All Mail");
    expect(findSpecialMailbox(folders, "trash")).toBe("Trash");
    expect(findSpecialMailbox(folders, "inbox")).toBe("INBOX");
  });

  test("falls back to folder names", () => {
    const unnamed: FolderSummary[] = [
      {
        path: "Archive",
        name: "Archive",
        delimiter: "/",
        parentPath: "",
        specialUse: null,
        flags: [],
        subscribed: true,
        messages: null,
        unseen: null,
      },
    ];
    expect(findSpecialMailbox(unnamed, "archive")).toBe("Archive");
  });
});
