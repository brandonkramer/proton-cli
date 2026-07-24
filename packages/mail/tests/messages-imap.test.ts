import { describe, expect, test } from "bun:test";
import type { FetchMessageObject, ImapFlow, MessageStructureObject } from "imapflow";
import {
  downloadMessageAttachment,
  listMailboxMessages,
  listMessageAttachments,
  readMailboxMessage,
  searchMailboxMessages,
} from "../src/imap/messages.ts";

function mockEnvelope(subject: string) {
  return {
    subject,
    from: [{ name: "Alice", address: "alice@example.com" }],
    to: [{ name: "Bob", address: "bob@example.com" }],
    date: new Date("2026-07-24T12:00:00.000Z"),
  };
}

function sampleSource() {
  return Buffer.from(
    [
      "From: Alice <alice@example.com>",
      "To: Bob <bob@example.com>",
      "Subject: Invoice",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Please pay",
    ].join("\r\n"),
    "utf8",
  );
}

function attachmentStructure(): MessageStructureObject {
  return {
    type: "multipart",
    childNodes: [
      {
        part: "2",
        type: "application",
        parameters: { subtype: "pdf" },
        disposition: "attachment",
        dispositionParameters: { filename: "invoice.pdf" },
        size: 11,
      },
    ],
  };
}

function createMockClient(state: {
  uids?: number[];
  fetchRows?: FetchMessageObject[];
  fetchOne?: FetchMessageObject | false;
  bodyStructure?: MessageStructureObject;
  downloadContent?: Buffer;
}): ImapFlow {
  const lock = { release: () => undefined };
  return {
    search: async () => state.uids ?? [],
    fetchAll: async () => state.fetchRows ?? [],
    fetchOne: async () => state.fetchOne ?? false,
    download: async () => ({
      meta: {
        expectedSize: state.downloadContent?.length ?? 0,
        contentType: "application/pdf",
        filename: "invoice.pdf",
      },
      content: (async function* contentStream() {
        if (state.downloadContent) yield state.downloadContent;
      })(),
    }),
    getMailboxLock: async () => lock,
  } as unknown as ImapFlow;
}

describe("listMailboxMessages", () => {
  test("returns newest messages up to limit", async () => {
    const client = createMockClient({
      uids: [1, 2, 3, 4, 5],
      fetchRows: [
        {
          seq: 5,
          uid: 5,
          envelope: mockEnvelope("Newest"),
          flags: new Set(["\\Seen"]),
          internalDate: new Date("2026-07-24T13:00:00.000Z"),
          size: 100,
        },
        {
          seq: 4,
          uid: 4,
          envelope: mockEnvelope("Older"),
          flags: new Set(),
          internalDate: new Date("2026-07-23T13:00:00.000Z"),
          size: 90,
        },
      ],
    });

    const items = await listMailboxMessages(client, "INBOX", 2);
    expect(items).toHaveLength(2);
    expect(items[0]?.ref).toBe("INBOX::5");
    expect(items[0]?.subject).toBe("Newest");
    expect(items[1]?.ref).toBe("INBOX::4");
    expect(items[1]?.seen).toBe(false);
  });
});

describe("readMailboxMessage", () => {
  test("parses message body from source", async () => {
    const client = createMockClient({
      fetchOne: {
        seq: 1,
        uid: 42,
        envelope: mockEnvelope("Invoice"),
        flags: new Set(["\\Seen"]),
        source: sampleSource(),
      },
    });

    const message = await readMailboxMessage(client, "INBOX", 42);
    expect(message.ref).toBe("INBOX::42");
    expect(message.subject).toBe("Invoice");
    expect(message.text).toBe("Please pay");
    expect(message.seen).toBe(true);
  });

  test("includes raw source when requested", async () => {
    const source = sampleSource();
    const client = createMockClient({
      fetchOne: {
        seq: 1,
        uid: 7,
        envelope: mockEnvelope("Invoice"),
        flags: new Set(),
        source,
      },
    });

    const message = await readMailboxMessage(client, "INBOX", 7, { raw: true });
    expect(message.raw).toBe(source.toString("utf8"));
  });
});

describe("searchMailboxMessages", () => {
  test("returns matching uid refs", async () => {
    const client = createMockClient({ uids: [10, 20] });
    const result = await searchMailboxMessages(client, "INBOX", { text: "invoice" });
    expect(result.ids).toEqual(["INBOX::20", "INBOX::10"]);
    expect(result.uids).toEqual([20, 10]);
  });
});

describe("listMessageAttachments", () => {
  test("lists attachment parts from body structure", async () => {
    const client = createMockClient({
      fetchOne: {
        seq: 1,
        uid: 99,
        bodyStructure: attachmentStructure(),
      },
    });

    const parts = await listMessageAttachments(client, "INBOX", 99);
    expect(parts).toEqual([
      {
        part: "2",
        filename: "invoice.pdf",
        contentType: "application/pdf",
        size: 11,
        disposition: "attachment",
      },
    ]);
  });
});

describe("downloadMessageAttachment", () => {
  test("downloads attachment bytes", async () => {
    const content = Buffer.from("%PDF-1.4", "utf8");
    const client = createMockClient({ downloadContent: content });
    const file = await downloadMessageAttachment(client, "INBOX", 99, "2");
    expect(file.part).toBe("2");
    expect(file.filename).toBe("invoice.pdf");
    expect(file.content.equals(content)).toBe(true);
  });
});
