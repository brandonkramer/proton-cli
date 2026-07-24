import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { CardEncryptedSigned, CardSigned } from "../src/crypto/types.ts";

// Isolate from events.test.ts module mocks.
mock.restore();

const mockVerifyMessage = mock(async () => ({ verificationStatus: 1 }));
const mockDecryptMessage = mock(async () => ({
  data: "SUMMARY:Meeting",
  verificationStatus: 1,
}));
const mockDecryptSessionKey = mock(async () => ({
  data: new Uint8Array([1, 2, 3]),
  algorithm: "aes256",
}));

mock.module("../src/crypto/proxy.ts", () => ({
  getCalendarCrypto: async () => ({
    signMessage: async () => ({ signature: "sig" }),
    encryptMessage: async () => ({ message: new Uint8Array([9, 9]) }),
    decryptMessage: mockDecryptMessage,
    verifyMessage: mockVerifyMessage,
    decryptSessionKey: mockDecryptSessionKey,
    encryptSessionKey: async () => new Uint8Array([1]),
    generateSessionKey: async () => ({
      data: new Uint8Array([1, 2, 3]),
      algorithm: "aes256",
    }),
    importPrivateKey: async () => ({}),
    importPublicKey: async () => ({}),
  }),
}));

// Cache-bust so we do not reuse the mocked event-card from events.test.ts.
const { decryptCards } = await import(
  `../src/crypto/event-card.ts?verify=${Date.now()}`
);

describe("event card crypto", () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockVerifyMessage.mockClear();
    mockDecryptMessage.mockClear();
    mockVerifyMessage.mockImplementation(async () => ({ verificationStatus: 1 }));
    mockDecryptMessage.mockImplementation(async () => ({
      data: "SUMMARY:Meeting",
      verificationStatus: 1,
    }));
  });

  test("decryptCards verifies signed and encrypted+signed cards", async () => {
    const out = await decryptCards(
      [
        { Type: CardSigned, Data: "BEGIN:VEVENT", Signature: "sig" },
        {
          Type: CardEncryptedSigned,
          Data: Buffer.from("enc").toString("base64"),
          Signature: "sig2",
        },
      ],
      {},
      {},
      Buffer.from("packet").toString("base64"),
    );
    expect(out).toEqual(["BEGIN:VEVENT", "SUMMARY:Meeting"]);
    expect(mockVerifyMessage).toHaveBeenCalled();
    expect(mockDecryptMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        armoredSignature: "sig2",
        expectSigned: true,
      }),
    );
  });

  test("decryptCards rejects failed signed verification", async () => {
    mockVerifyMessage.mockImplementation(async () => ({ verificationStatus: 2 }));
    await expect(
      decryptCards(
        [{ Type: CardSigned, Data: "BEGIN:VEVENT", Signature: "bad" }],
        {},
        {},
        "",
      ),
    ).rejects.toThrow(/signature verification failed/i);
  });

  test("decryptCards rejects missing signatures", async () => {
    await expect(
      decryptCards([{ Type: CardSigned, Data: "BEGIN:VEVENT" }], {}, {}, ""),
    ).rejects.toThrow(/signature missing/i);
  });

  test("decryptCards rejects failed encrypted verification", async () => {
    mockDecryptMessage.mockImplementation(async () => ({
      data: "SUMMARY:Meeting",
      verificationStatus: 2,
    }));
    await expect(
      decryptCards(
        [
          {
            Type: CardEncryptedSigned,
            Data: Buffer.from("enc").toString("base64"),
            Signature: "bad",
          },
        ],
        {},
        {},
        Buffer.from("packet").toString("base64"),
      ),
    ).rejects.toThrow(/signature verification failed/i);
  });
});
