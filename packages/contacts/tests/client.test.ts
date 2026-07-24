import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { DecryptedUserKey } from "@bkramer/proton-core";
import { CardEncryptedSigned, CardSigned } from "../src/vcard/vcard.ts";
import { buildSignedVCard } from "../src/vcard/vcard.ts";

const fetchCalls: Array<{ path: string; method?: string; body?: unknown }> = [];

let aliceSignedData = buildSignedVCard({
  name: "Alice",
  uid: "uid-alice",
  emails: [{ address: "alice@example.com", keyValues: [] }],
});

const SAMPLE_ARMORED_KEY = [
  "-----BEGIN PGP PUBLIC KEY BLOCK-----",
  "Version: Test",
  "",
  "QmxvYg==",
  "-----END PGP PUBLIC KEY BLOCK-----",
].join("\n");

const mockFetch = mock(async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  const path = url.replace("https://contacts-api.proton.me", "").replace(/\?.*$/, "");
  const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  fetchCalls.push({ path: path + query, method, body });

  if (path.startsWith("/contacts/v4/contacts/export")) {
    return new Response(
      JSON.stringify({
        Contacts: [
          {
            ID: "contact-alice-id==" + "x".repeat(44),
            Cards: [{ Type: CardSigned, Data: "BEGIN:VCARD\r\nFN:Alice\r\nitem1.EMAIL;PREF=1:alice@example.com\r\nEND:VCARD" }],
          },
          {
            ID: "contact-anna-id==" + "y".repeat(44),
            Cards: [{ Type: CardSigned, Data: "BEGIN:VCARD\r\nFN:Anna\r\nitem1.EMAIL;PREF=1:anna@example.com\r\nEND:VCARD" }],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (path.match(/^\/contacts\/v4\/contacts\/contact-alice/) && method === "PUT") {
    const signed = (body?.Cards as Array<{ Type: number; Data: string }> | undefined)?.find(
      (card) => card.Type === CardSigned,
    );
    if (signed?.Data) aliceSignedData = signed.Data;
    return new Response(
      JSON.stringify({
        Contact: {
          ID: "contact-alice-id==" + "x".repeat(44),
          Cards: body?.Cards ?? [],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (path.match(/^\/contacts\/v4\/contacts\/contact-alice/)) {
    return new Response(
      JSON.stringify({
        Contact: {
          ID: "contact-alice-id==" + "x".repeat(44),
          Cards: [
            { Type: CardSigned, Data: aliceSignedData, Signature: "sig" },
            { Type: CardEncryptedSigned, Data: "ENC", Signature: "SIG" },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (path === "/contacts/v4/contacts" && method === "POST") {
    const cards = body?.Contacts?.[0]?.Cards ?? [];
    return new Response(
      JSON.stringify({
        Responses: [
          {
            Response: {
              Contact: {
                ID: "new-contact-id==" + "z".repeat(44),
                Cards: cards,
              },
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (path === "/contacts/v4/contacts/delete") {
    return new Response(JSON.stringify({ Code: 1000 }), { status: 200 });
  }

  if (path === "/core/v4/labels" && method === "GET") {
    return new Response(
      JSON.stringify({
        Labels: [{ ID: "group-1", Name: "Team", Color: "#8080FF" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (path === "/core/v4/labels" && method === "POST") {
    return new Response(
      JSON.stringify({
        Label: { ID: "group-new", Name: body?.Name, Color: body?.Color },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (path.startsWith("/core/v4/labels/group-") && method === "DELETE") {
    return new Response(JSON.stringify({ Code: 1000 }), { status: 200 });
  }

  if (path === "/contacts/v4/contacts/label" || path === "/contacts/v4/contacts/unlabel") {
    return new Response(JSON.stringify({ Code: 1000 }), { status: 200 });
  }

  return new Response(JSON.stringify({ Error: "not found" }), { status: 404 });
});

mock.module("../src/crypto/proxy.ts", () => ({
  getCryptoProxy: async () => ({
    setEndpoint: () => {},
    importPrivateKey: async () => ({}),
    importPublicKey: async () => ({}),
    signMessage: async () => "-----BEGIN PGP SIGNATURE-----\nsig\n-----END PGP SIGNATURE-----",
    encryptMessage: async () => ({
      message: "-----BEGIN PGP MESSAGE-----\ncipher\n-----END PGP MESSAGE-----",
    }),
    decryptMessage: async ({ armoredMessage }: { armoredMessage?: string }) => ({
      data: new TextEncoder().encode(String(armoredMessage ?? "")),
    }),
  }),
}));

const { ContactsClient } = await import("../src/proton/client.ts");

const session = {
  Code: 1000,
  AccessToken: "token",
  RefreshToken: "refresh",
  TokenType: "Bearer",
  Scopes: [],
  UID: "uid",
  UserID: "user",
  ExpiresIn: 3600,
};

const userKey: DecryptedUserKey = {
  ID: "key-1",
  privateKey: {},
  publicKey: {},
};

describe("ContactsClient", () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    fetchCalls.length = 0;
    mockFetch.mockClear();
    aliceSignedData = buildSignedVCard({
      name: "Alice",
      uid: "uid-alice",
      emails: [{ address: "alice@example.com", keyValues: [] }],
    });
  });

  test("listAll decrypts contacts", async () => {
    const client = new ContactsClient({
      session,
      userKey,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const contacts = await client.listAll();
    expect(contacts).toHaveLength(2);
    expect(contacts[0]?.name).toBe("Alice");
  });

  test("resolveRef matches unique search", async () => {
    const client = new ContactsClient({
      session,
      userKey,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const id = await client.resolveRef("alice@example.com");
    expect(id.startsWith("contact-alice-id")).toBe(true);
  });

  test("resolveRef rejects ambiguous search", async () => {
    const client = new ContactsClient({
      session,
      userKey,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    await expect(client.resolveRef("a")).rejects.toMatchObject({ exitCode: 4 });
  });

  test("create encrypts cards before POST", async () => {
    const client = new ContactsClient({
      session,
      userKey,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const id = await client.create({
      name: "Bob",
      emails: ["bob@example.com"],
      phones: ["+123"],
      note: "",
      org: "",
      title: "",
      birthday: "",
      address: "",
      url: "",
    });
    expect(id.startsWith("new-contact-id")).toBe(true);
    const post = fetchCalls.find((call) => call.method === "POST");
    expect(post).toBeDefined();
    const cards = (post?.body as { Contacts: Array<{ Cards: Array<{ Type: number; Data: string }> }> })
      .Contacts[0]?.Cards;
    expect(cards?.some((card) => card.Type === 3)).toBe(true);
    expect(cards?.every((card) => !card.Data.includes("TEL;PREF=1:+123"))).toBe(true);
  });

  test("delete sends IDs payload", async () => {
    const client = new ContactsClient({
      session,
      userKey,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    await client.delete(["contact-alice-id==" + "x".repeat(44)]);
    const del = fetchCalls.find((call) => call.path === "/contacts/v4/contacts/delete");
    expect(del?.method).toBe("PUT");
    expect((del?.body as { IDs: string[] }).IDs).toHaveLength(1);
  });

  test("pinKey writes pinned key and preserves other cards", async () => {
    const client = new ContactsClient({
      session,
      userKey,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const id = "contact-alice-id==" + "x".repeat(44);
    await client.pinKey({
      id,
      email: "alice@example.com",
      armoredKey: SAMPLE_ARMORED_KEY,
    });
    const put = fetchCalls.find(
      (call) => call.method === "PUT" && call.path.startsWith("/contacts/v4/contacts/contact-alice"),
    );
    expect(put).toBeDefined();
    const cards = (put?.body as { Cards: Array<{ Type: number; Data: string }> }).Cards;
    expect(cards).toHaveLength(2);
    expect(cards[0]?.Data).toContain("data:application/pgp-keys;base64,");
    expect(cards[0]?.Data).toContain("X-PM-ENCRYPT:true");
    expect(cards[1]?.Data).toBe("ENC");
  });

  test("unpinKey clears pinned keys", async () => {
    const client = new ContactsClient({
      session,
      userKey,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const id = "contact-alice-id==" + "x".repeat(44);
    await client.pinKey({
      id,
      email: "alice@example.com",
      armoredKey: SAMPLE_ARMORED_KEY,
    });
    fetchCalls.length = 0;
    await client.unpinKey(id, "alice@example.com");
    const put = fetchCalls.find((call) => call.method === "PUT");
    const signedData = (put?.body as { Cards: Array<{ Data: string }> }).Cards[0]?.Data ?? "";
    expect(signedData).not.toContain("data:application/pgp-keys;base64,");
    expect(signedData).not.toContain("X-PM-ENCRYPT");
  });

  test("unpinKey rejects missing pinned key", async () => {
    const client = new ContactsClient({
      session,
      userKey,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const id = "contact-alice-id==" + "x".repeat(44);
    await expect(client.unpinKey(id, "alice@example.com")).rejects.toMatchObject({
      exitCode: 3,
    });
  });

  test("listGroups reads type-2 labels", async () => {
    const client = new ContactsClient({
      session,
      userKey,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const groups = await client.listGroups();
    expect(groups).toEqual([
      { id: "group-1", name: "Team", color: "#8080FF" },
    ]);
    expect(fetchCalls[0]?.path).toContain("/core/v4/labels?Type=2");
  });

  test("createGroup posts label", async () => {
    const client = new ContactsClient({
      session,
      userKey,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const id = await client.createGroup("Work", "#8080FF");
    expect(id).toBe("group-new");
    expect((fetchCalls[0]?.body as { Type: number }).Type).toBe(2);
  });

  test("addGroupMembers labels contacts", async () => {
    const client = new ContactsClient({
      session,
      userKey,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const contactId = "contact-alice-id==" + "x".repeat(44);
    await client.addGroupMembers("group-1", [contactId]);
    expect(fetchCalls[0]?.path).toBe("/contacts/v4/contacts/label");
    expect(fetchCalls[0]?.body).toEqual({
      LabelID: "group-1",
      ContactIDs: [contactId],
    });
  });

  test("removeGroupMembers unlabels contacts", async () => {
    const client = new ContactsClient({
      session,
      userKey,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    const contactId = "contact-alice-id==" + "x".repeat(44);
    await client.removeGroupMembers("group-1", [contactId]);
    expect(fetchCalls[0]?.path).toBe("/contacts/v4/contacts/unlabel");
  });
});
