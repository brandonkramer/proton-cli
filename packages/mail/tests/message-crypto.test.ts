import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { UnlockedAddressKey } from "../src/crypto/unlock.ts";

mock.restore();

const mockDecryptMessage = mock(
  async (options: {
    armoredMessage?: string;
    decryptionKeys?: unknown[];
    verificationKeys?: unknown[];
  }) => ({
    data: `plain:${options.armoredMessage ?? ""}`,
    verified: Boolean(options.verificationKeys?.length),
  }),
);

const mockImportPublicKey = mock(async ({ armoredKey }: { armoredKey: string }) => ({
  kind: "public",
  armoredKey,
}));

const mockCryptoProxy = {
  setEndpoint: () => {
    throw new Error("mail must not call setEndpoint");
  },
  importPrivateKey: async () => ({ kind: "private" }),
  importPublicKey: mockImportPublicKey,
  encryptMessage: async () => ({ message: new Uint8Array() }),
  decryptMessage: mockDecryptMessage,
};

let decryptMessageBody: typeof import("../src/crypto/decrypt.ts").decryptMessageBody;
let clearSenderKeyCache: typeof import("../src/crypto/sender-keys.ts").clearSenderKeyCache;
let fetchSenderPublicKeys: typeof import("../src/crypto/sender-keys.ts").fetchSenderPublicKeys;
let primaryAddressKey: typeof import("../src/crypto/unlock.ts").primaryAddressKey;
let addressKeyForId: typeof import("../src/crypto/unlock.ts").addressKeyForId;

describe("mail message crypto (PH1)", () => {
  beforeAll(async () => {
    mock.restore();
    mock.module("../src/crypto/proxy.ts", () => ({
      getCryptoProxy: async () => mockCryptoProxy,
    }));
    // Cache-bust so a sibling file's mock.module(decrypt) cannot leak in.
    const stamp = String(Date.now());
    ({ decryptMessageBody } = await import(
      `../src/crypto/decrypt.ts?crypto=${stamp}`
    ));
    ({ clearSenderKeyCache, fetchSenderPublicKeys } = await import(
      `../src/crypto/sender-keys.ts?crypto=${stamp}`
    ));
    ({ primaryAddressKey, addressKeyForId } = await import(
      `../src/crypto/unlock.ts?crypto=${stamp}`
    ));
  });

  afterAll(() => {
    mock.restore();
    clearSenderKeyCache?.();
  });

  test("decryptMessageBody decrypts armored body with address key", async () => {
    mockDecryptMessage.mockClear();
    const addressKeys = new Map<string, UnlockedAddressKey>([
      [
        "addr-1",
        {
          addressId: "addr-1",
          email: "me@proton.me",
          privateKey: { kind: "private" },
          publicKey: { kind: "public" },
        },
      ],
    ]);

    const armored =
      "-----BEGIN PGP MESSAGE-----\nCIPHER\n-----END PGP MESSAGE-----";
    const result = await decryptMessageBody({
      armoredBody: armored,
      addressKeys,
      addressId: "addr-1",
      cryptoProxy: mockCryptoProxy as never,
    });

    expect(result.plaintext).toBe(`plain:${armored}`);
    expect(result.verified).toBeNull();
    expect(mockDecryptMessage).toHaveBeenCalledTimes(1);
    expect(mockDecryptMessage.mock.calls[0]?.[0]).toMatchObject({
      armoredMessage: armored,
      decryptionKeys: [{ kind: "private" }],
      format: "utf8",
    });
  });

  test("decryptMessageBody returns plaintext when body is not armored", async () => {
    mockDecryptMessage.mockClear();
    const addressKeys = new Map<string, UnlockedAddressKey>([
      [
        "addr-1",
        {
          addressId: "addr-1",
          email: "me@proton.me",
          privateKey: { kind: "private" },
          publicKey: { kind: "public" },
        },
      ],
    ]);

    const result = await decryptMessageBody({
      armoredBody: "hello plain",
      addressKeys,
      addressId: "addr-1",
      cryptoProxy: mockCryptoProxy as never,
    });

    expect(result).toEqual({ plaintext: "hello plain", verified: null });
    expect(mockDecryptMessage).not.toHaveBeenCalled();
  });

  test("decryptMessageBody uses sender keys for verification (best-effort)", async () => {
    mockDecryptMessage.mockClear();
    clearSenderKeyCache();

    const fetchImpl = mock(async (input: string | URL) => {
      const url = String(input);
      if (!url.includes("/core/v4/keys/all")) {
        throw new Error(`unexpected fetch: ${url}`);
      }
      return new Response(
        JSON.stringify({
          Code: 1000,
          Address: {
            Keys: [
              {
                PublicKey:
                  "-----BEGIN PGP PUBLIC KEY BLOCK-----\nk\n-----END PGP PUBLIC KEY BLOCK-----",
              },
            ],
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const addressKeys = new Map<string, UnlockedAddressKey>([
      [
        "addr-1",
        {
          addressId: "addr-1",
          email: "me@proton.me",
          privateKey: { kind: "private" },
          publicKey: { kind: "public" },
        },
      ],
    ]);

    const armored =
      "-----BEGIN PGP MESSAGE-----\nSIGNED\n-----END PGP MESSAGE-----";
    const result = await decryptMessageBody({
      armoredBody: armored,
      addressKeys,
      addressId: "addr-1",
      senderEmail: "sender@example.com",
      fetchImpl,
      cryptoProxy: mockCryptoProxy as never,
      loadSenderKeys: async () => [{ kind: "sender-public" }],
    });

    expect(result.plaintext).toBe(`plain:${armored}`);
    expect(result.verified).toBe(true);
    expect(
      mockDecryptMessage.mock.calls[0]?.[0]?.verificationKeys?.length,
    ).toBeGreaterThan(0);
  });

  test("fetchSenderPublicKeys returns empty on failure (no throw)", async () => {
    clearSenderKeyCache();
    const fetchImpl = mock(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const keys = await fetchSenderPublicKeys("missing@example.com", {
      fetchImpl,
    });
    expect(keys).toEqual([]);
  });

  test("addressKeyForId resolves map entry", () => {
    const addressKeys = new Map<string, UnlockedAddressKey>([
      [
        "addr-1",
        {
          addressId: "addr-1",
          email: "me@proton.me",
          privateKey: 1,
          publicKey: 1,
        },
      ],
    ]);
    expect(addressKeyForId({ addressKeys }, "addr-1").email).toBe(
      "me@proton.me",
    );
  });

  test("primaryAddressKey prefers proton.me address", () => {
    const addressKeys = new Map<string, UnlockedAddressKey>([
      [
        "a1",
        {
          addressId: "a1",
          email: "alias@custom.com",
          privateKey: 1,
          publicKey: 1,
        },
      ],
      [
        "a2",
        {
          addressId: "a2",
          email: "user@proton.me",
          privateKey: 2,
          publicKey: 2,
        },
      ],
    ]);
    const key = primaryAddressKey({
      addresses: [
        { ID: "a1", Email: "alias@custom.com", Keys: [] },
        { ID: "a2", Email: "user@proton.me", Keys: [] },
      ],
      addressKeys,
    });
    expect(key.addressId).toBe("a2");
  });
});
