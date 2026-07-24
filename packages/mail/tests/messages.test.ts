import { afterAll, describe, expect, test } from "bun:test";
import type { Session } from "../src/proton/types.ts";
import { LABEL_INBOX, MAIL_MESSAGES_PATH } from "../src/proton/constants.ts";

const mockSession: Session = {
  Code: 1000,
  AccessToken: "access-token",
  RefreshToken: "refresh-token",
  TokenType: "Bearer",
  Scopes: ["full"],
  UID: "uid-1",
  UserID: "user-1",
  ExpiresIn: 3600,
};

const sampleMetadata = {
  ID: "msg-1",
  ConversationID: "conv-1",
  AddressID: "addr-1",
  LabelIDs: [LABEL_INBOX],
  ExternalID: "ext-1",
  Subject: "Hello World",
  Sender: { Name: "Alice", Address: "alice@proton.me" },
  ToList: [{ Name: "Bob", Address: "bob@proton.me" }],
  CCList: [],
  BCCList: [],
  ReplyTos: [],
  Time: 1_700_000_000,
  Size: 1200,
  Unread: 1,
  IsReplied: 0,
  IsRepliedAll: 0,
  IsForwarded: 0,
  NumAttachments: 0,
  Flags: 1,
};

const {
  listMessages,
  getMessage,
  searchMessages,
} = await import("../src/proton/client.ts");

const {
  listMessagesForCommand,
  searchMessages: searchMessagesForCommand,
  getAndDecryptMessage,
} = await import("../src/service/messages.ts");

function mockFetch(routes: Record<string, (init?: RequestInit) => unknown>) {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const path = new URL(url).pathname;
    const handler = routes[path];
    if (!handler) {
      throw new Error(`unexpected fetch: ${path} ${init?.method ?? "GET"}`);
    }
    const body = handler(init);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

describe("CASE-LIST-READ", () => {
  afterAll(() => {
    // no module mocks — safe alongside crypto tests
  });

  test("listMessages POSTs metadata query to mail-api", async () => {
    let method: string | undefined;
    let posted: Record<string, unknown> | undefined;
    let override: string | null | undefined;
    const fetchImpl = mockFetch({
      [MAIL_MESSAGES_PATH]: (init) => {
        method = init?.method;
        posted = init?.body ? JSON.parse(String(init.body)) : undefined;
        const headers = init?.headers;
        if (headers instanceof Headers) {
          override = headers.get("X-HTTP-Method-Override");
        } else if (headers && typeof headers === "object") {
          override =
            (headers as Record<string, string>)["X-HTTP-Method-Override"] ??
            null;
        }
        return { Messages: [sampleMetadata], Total: 1 };
      },
    });

    const page = await listMessages({
      session: mockSession,
      fetchImpl,
      labelId: LABEL_INBOX,
      page: 0,
      pageSize: 10,
    });

    expect(page.messages).toHaveLength(1);
    expect(page.messages[0]?.Subject).toBe("Hello World");
    expect(page.total).toBe(1);
    expect(method).toBe("POST");
    expect(posted).toMatchObject({
      Page: 0,
      PageSize: 10,
      LabelID: LABEL_INBOX,
    });
    expect(override ?? "").toBe("GET");
  });

  test("searchMessages passes Keyword filter", async () => {
    let posted: Record<string, unknown> | undefined;
    const fetchImpl = mockFetch({
      [MAIL_MESSAGES_PATH]: (init) => {
        posted = init?.body ? JSON.parse(String(init.body)) : undefined;
        return { Messages: [sampleMetadata], Total: 1 };
      },
    });

    await searchMessages({
      session: mockSession,
      fetchImpl,
      keyword: "invoice",
      from: "billing@example.com",
    });

    expect(posted?.Keyword).toBe("invoice");
    expect(posted?.From).toBe("billing@example.com");
  });

  test("getMessage fetches full message by id", async () => {
    const fetchImpl = mockFetch({
      [`${MAIL_MESSAGES_PATH}/msg-1`]: () => ({
        Message: {
          ...sampleMetadata,
          Header: "From: alice@proton.me",
          Body: "-----BEGIN PGP MESSAGE-----\ncipher\n-----END PGP MESSAGE-----",
          MIMEType: "text/html",
          Attachments: [],
        },
      }),
    });

    const message = await getMessage({
      session: mockSession,
      fetchImpl,
      messageId: "msg-1",
    });

    expect(message.ID).toBe("msg-1");
    expect(message.Body).toContain("PGP MESSAGE");
  });

  test("listMessagesForCommand maps metadata summaries", async () => {
    const fetchImpl = mockFetch({
      [MAIL_MESSAGES_PATH]: () => ({ Messages: [sampleMetadata], Total: 1 }),
    });

    const page = await listMessagesForCommand({
      session: mockSession,
      fetchImpl,
    });

    expect(page.messages[0]).toMatchObject({
      id: "msg-1",
      subject: "Hello World",
      sender: "alice@proton.me",
      senderName: "Alice",
      senderEmail: "alice@proton.me",
      unread: true,
    });
  });

  test("getAndDecryptMessage returns plaintext body without armored wrapper", async () => {
    const fetchImpl = mockFetch({
      [`${MAIL_MESSAGES_PATH}/msg-1`]: () => ({
        Message: {
          ...sampleMetadata,
          Header: "",
          Body: "Hello plain body",
          MIMEType: "text/plain",
          Attachments: [],
        },
      }),
    });

    const decrypted = await getAndDecryptMessage({
      session: mockSession,
      fetchImpl,
      messageId: "msg-1",
    });

    expect(decrypted.body).toBe("Hello plain body");
    expect(decrypted.mimeType).toBe("text/plain");
    expect(decrypted.verified).toBeNull();
  });
});

