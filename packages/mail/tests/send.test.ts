import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Session } from "../src/proton/types.ts";
import { MAIL_MESSAGES_PATH } from "../src/proton/constants.ts";
import { configureAgentFlags } from "../src/util/agent.ts";
import {
  assertEncryptedBody,
  PACKAGE_TYPE,
} from "../src/crypto/send.ts";
import {
  ensureForwardSubject,
  ensureReplySubject,
  formatForwardBody,
  formatReplyBody,
  parseAddressList,
} from "../src/crypto/mime.ts";
import { CliError } from "../src/util/errors.ts";

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

const ENV_KEYS = ["PROTONMAIL_READ_ONLY", "PROTONMAIL_ALLOW_SEND"] as const;

const { sendMail } = await import("../src/service/send.ts");
const { encryptForSend } = await import("../src/crypto/send.ts");

beforeEach(() => {
  configureAgentFlags({ json: false, yes: false, dryRun: false });
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  configureAgentFlags({ json: false, yes: false, dryRun: false });
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("mime compose helpers", () => {
  test("parseAddressList handles name+email and bare email", () => {
    expect(parseAddressList(["Alice <a@ex.com>", "b@ex.com"])).toEqual([
      { Name: "Alice", Address: "a@ex.com" },
      { Name: "", Address: "b@ex.com" },
    ]);
  });

  test("reply/forward subject prefixes", () => {
    expect(ensureReplySubject("Hi")).toBe("Re: Hi");
    expect(ensureReplySubject("Re: Hi")).toBe("Re: Hi");
    expect(ensureForwardSubject("Hi")).toBe("Fwd: Hi");
    expect(ensureForwardSubject("Fwd: Hi")).toBe("Fwd: Hi");
  });

  test("formatReplyBody quotes original", () => {
    const body = formatReplyBody(
      "hello",
      { Name: "Alice", Address: "a@ex.com" },
      1_700_000_000,
    );
    expect(body).toContain("Alice <a@ex.com>");
    expect(body).toContain("> hello");
  });

  test("formatForwardBody includes headers", () => {
    const body = formatForwardBody("payload", {
      subject: "Orig",
      sender: { Name: "", Address: "a@ex.com" },
      to: [{ Name: "", Address: "b@ex.com" }],
      cc: [],
      time: 1_700_000_000,
    });
    expect(body).toContain("Forwarded message");
    expect(body).toContain("Subject: Orig");
    expect(body).toContain("payload");
  });
});

describe("encryptForSend / INV-E2EE-001", () => {
  test("assertEncryptedBody rejects plaintext", () => {
    expect(() => assertEncryptedBody("hello")).toThrow(CliError);
  });

  test("encryptForSend never returns plaintext draft Body", async () => {
    const sessionKey = {
      data: new Uint8Array([1, 2, 3, 4]),
      algorithm: "aes256",
    };
    let encryptSessionKeys: unknown[] | undefined;
    const cryptoProxy = {
      encryptMessage: async (opts: Record<string, unknown>) => {
        if (opts.format === "armored") {
          return {
            message:
              "-----BEGIN PGP MESSAGE-----\nDRAFT\n-----END PGP MESSAGE-----",
          };
        }
        return { message: new Uint8Array([9, 9, 9]) };
      },
      generateSessionKey: async () => sessionKey,
      encryptSessionKey: async (opts: Record<string, unknown>) => {
        encryptSessionKeys = opts.encryptionKeys as unknown[];
        return new Uint8Array([7, 7]);
      },
    };

    const result = await encryptForSend({
      plaintext: "secret body",
      senderKey: {
        addressId: "addr-1",
        email: "me@proton.me",
        privateKey: { kind: "private" },
        publicKey: { kind: "public" },
      },
      recipients: [
        {
          email: "bob@proton.me",
          publicKeys: [{ kind: "bob-1" }, { kind: "bob-2" }],
        },
        { email: "ext@example.com", publicKeys: [] },
      ],
      cryptoProxy: cryptoProxy as never,
    });

    expect(result.draftBody).toContain("BEGIN PGP MESSAGE");
    expect(result.draftBody).not.toContain("secret body");
    expect(result.packages).toHaveLength(1);
    const pack = result.packages[0]!;
    expect(pack.Type & PACKAGE_TYPE.SEND_PM).toBeTruthy();
    expect(pack.Type & PACKAGE_TYPE.SEND_CLEAR).toBeTruthy();
    expect(pack.Addresses["bob@proton.me"]?.BodyKeyPacket).toBeTruthy();
    expect(pack.BodyKey?.Key).toBeTruthy();
    // Full active key ring — not only publicKeys[0].
    expect(encryptSessionKeys).toEqual([{ kind: "bob-1" }, { kind: "bob-2" }]);
  });
});

describe("CASE-SEND-DRYRUN", () => {
  test("dry-run never POSTs", async () => {
    configureAgentFlags({ json: true, yes: true, dryRun: true });
    let fetchCalls = 0;
    const fetchImpl = (async () => {
      fetchCalls += 1;
      throw new Error("network should not be called in dry-run");
    }) as unknown as typeof fetch;

    const plan = await sendMail(
      {
        action: "send",
        to: ["bob@proton.me"],
        subject: "Hello",
        body: "plaintext must not leave this process",
      },
      { session: mockSession, fetchImpl },
    );

    expect(fetchCalls).toBe(0);
    expect(plan).toMatchObject({
      dryRun: true,
      action: "send",
      subject: "Hello",
      to: ["bob@proton.me"],
      encryptBody: true,
    });
  });

  test("live send creates draft then packages; Body is ciphertext", async () => {
    const posts: { path: string; body: Record<string, unknown> }[] = [];
    const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {};
      posts.push({ path, body });

      if (path === MAIL_MESSAGES_PATH && init?.method === "POST") {
        const message = body.Message as { Body?: string };
        if (!message?.Body?.includes("BEGIN PGP MESSAGE")) {
          throw new Error("plaintext Body uploaded");
        }
        return new Response(
          JSON.stringify({
            Code: 1000,
            Message: {
              ID: "draft-1",
              ConversationID: "c1",
              AddressID: "addr-1",
              LabelIDs: ["8"],
              ExternalID: "",
              Subject: "Hello",
              Sender: { Name: "", Address: "me@proton.me" },
              ToList: [{ Name: "", Address: "bob@proton.me" }],
              CCList: [],
              BCCList: [],
              ReplyTos: [],
              Time: 1,
              Size: 1,
              Unread: 0,
              IsReplied: 0,
              IsRepliedAll: 0,
              IsForwarded: 0,
              NumAttachments: 0,
              Flags: 0,
              Header: "",
              Body: message.Body,
              MIMEType: "text/plain",
              Attachments: [],
            },
          }),
          { status: 200 },
        );
      }

      if (path === `${MAIL_MESSAGES_PATH}/draft-1`) {
        return new Response(
          JSON.stringify({ Code: 1000, Message: { ID: "draft-1" } }),
          { status: 200 },
        );
      }

      throw new Error(`unexpected fetch: ${path}`);
    }) as unknown as typeof fetch;

    const result = await sendMail(
      {
        action: "send",
        to: ["bob@proton.me"],
        subject: "Hello",
        body: "secret",
      },
      {
        session: mockSession,
        fetchImpl,
        addressKeys: new Map([
          [
            "addr-1",
            {
              addressId: "addr-1",
              email: "me@proton.me",
              privateKey: {},
              publicKey: {},
            },
          ],
        ]),
        addresses: [{ ID: "addr-1", Email: "me@proton.me", Keys: [] }],
        loadRecipientKeys: async () => [{ kind: "pub" }],
        encrypt: async () => ({
          draftBody:
            "-----BEGIN PGP MESSAGE-----\nENC\n-----END PGP MESSAGE-----",
          mimeType: "text/plain",
          packages: [
            {
              Addresses: {
                "bob@proton.me": {
                  Type: PACKAGE_TYPE.SEND_PM,
                  Signature: 1,
                  BodyKeyPacket: "abc",
                },
              },
              MIMEType: "text/plain",
              Type: PACKAGE_TYPE.SEND_PM,
              Body: "Ym9keQ==",
            },
          ],
        }),
      },
    );

    expect(result).toMatchObject({
      action: "send",
      messageId: "draft-1",
      subject: "Hello",
    });
    expect(posts).toHaveLength(2);
    expect(posts[0]?.path).toBe(MAIL_MESSAGES_PATH);
    expect(posts[1]?.path).toBe(`${MAIL_MESSAGES_PATH}/draft-1`);
    const draftMessage = posts[0]?.body.Message as { Body: string };
    expect(draftMessage.Body).toContain("BEGIN PGP MESSAGE");
    expect(draftMessage.Body).not.toContain("secret");
  });

  test("safety gate blocks live send before POST", async () => {
    process.env.PROTONMAIL_ALLOW_SEND = "false";
    let fetchCalls = 0;
    const fetchImpl = (async () => {
      fetchCalls += 1;
      throw new Error("should not fetch");
    }) as unknown as typeof fetch;

    await expect(
      sendMail(
        {
          action: "send",
          to: ["bob@proton.me"],
          subject: "Hi",
          body: "x",
        },
        { session: mockSession, fetchImpl },
      ),
    ).rejects.toThrow(/ALLOW_SEND/);
    expect(fetchCalls).toBe(0);
  });

  test("recipient key lookup failure fails closed (no clear BodyKey)", async () => {
    let fetchCalls = 0;
    const fetchImpl = (async () => {
      fetchCalls += 1;
      throw new Error("should not fetch after lookup failure");
    }) as unknown as typeof fetch;

    await expect(
      sendMail(
        {
          action: "send",
          to: ["bob@proton.me"],
          subject: "Hello",
          body: "secret",
        },
        {
          session: mockSession,
          fetchImpl,
          addressKeys: new Map([
            [
              "addr-1",
              {
                addressId: "addr-1",
                email: "me@proton.me",
                privateKey: {},
                publicKey: {},
              },
            ],
          ]),
          addresses: [{ ID: "addr-1", Email: "me@proton.me", Keys: [] }],
          loadRecipientKeys: async () => {
            throw new CliError("Public-key lookup failed for bob@proton.me: network down");
          },
        },
      ),
    ).rejects.toThrow(/Public-key lookup failed/);
    expect(fetchCalls).toBe(0);
  });

  test("dry-run still ok when recipient key lookup would fail", async () => {
    configureAgentFlags({ json: true, yes: true, dryRun: true });
    let lookupCalls = 0;
    const plan = await sendMail(
      {
        action: "send",
        to: ["bob@proton.me"],
        subject: "Hello",
        body: "x",
      },
      {
        session: mockSession,
        loadRecipientKeys: async () => {
          lookupCalls += 1;
          throw new Error("lookup should not run in dry-run");
        },
      },
    );
    expect(lookupCalls).toBe(0);
    expect(plan).toMatchObject({ dryRun: true, encryptBody: true });
  });
});
