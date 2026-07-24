import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { DecryptedUserKey } from "@bkramer/proton-core";
import { CardEncryptedSigned, CardSigned } from "../src/vcard/vcard.ts";

const mockSignMessage = mock(async () => "-----BEGIN PGP SIGNATURE-----\nsig\n-----END PGP SIGNATURE-----");
const mockEncryptMessage = mock(async () => ({
  message: "-----BEGIN PGP MESSAGE-----\ncipher\n-----END PGP MESSAGE-----",
}));
const mockDecryptMessage = mock(async () => ({
  data: new TextEncoder().encode("decrypted"),
  verificationStatus: 1,
}));
const mockVerifyMessage = mock(async () => ({ verificationStatus: 1 }));

mock.module("../src/crypto/proxy.ts", () => ({
  getCryptoProxy: async () => ({
    setEndpoint: () => {},
    importPrivateKey: async () => ({}),
    importPublicKey: async () => ({}),
    signMessage: mockSignMessage,
    encryptMessage: mockEncryptMessage,
    decryptMessage: mockDecryptMessage,
    verifyMessage: mockVerifyMessage,
  }),
}));

const { signCard, encryptAndSignCard, decryptCards } = await import("../src/crypto/card.ts");

const userKey: DecryptedUserKey = {
  ID: "key-1",
  privateKey: { kind: "private" },
  publicKey: { kind: "public" },
};

describe("contact card crypto", () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockSignMessage.mockClear();
    mockEncryptMessage.mockClear();
    mockDecryptMessage.mockClear();
    mockVerifyMessage.mockClear();
    mockVerifyMessage.mockImplementation(async () => ({ verificationStatus: 1 }));
    mockDecryptMessage.mockImplementation(async () => ({
      data: new TextEncoder().encode("decrypted"),
      verificationStatus: 1,
    }));
  });

  test("signCard produces signed card type 2", async () => {
    const card = await signCard("BEGIN:VCARD\nFN:Alice\nEND:VCARD", userKey);
    expect(card.Type).toBe(CardSigned);
    expect(card.Data).toContain("FN:Alice");
    expect(card.Signature).toContain("PGP SIGNATURE");
    expect(mockSignMessage).toHaveBeenCalledTimes(1);
  });

  test("encryptAndSignCard produces encrypted+signed card type 3", async () => {
    const card = await encryptAndSignCard("BEGIN:VCARD\nTEL:123\nEND:VCARD", userKey);
    expect(card.Type).toBe(CardEncryptedSigned);
    expect(card.Data).toContain("PGP MESSAGE");
    expect(card.Signature).toContain("PGP SIGNATURE");
    expect(mockEncryptMessage).toHaveBeenCalledTimes(1);
    expect(mockSignMessage).toHaveBeenCalledTimes(1);
  });

  test("decryptCards verifies signed cards and decrypts encrypted cards", async () => {
    const plaintext = await decryptCards(
      [
        { Type: CardSigned, Data: "plain", Signature: "sig" },
        { Type: CardEncryptedSigned, Data: "cipher", Signature: "sig" },
      ],
      userKey,
    );
    expect(plaintext).toEqual(["plain", "decrypted"]);
    expect(mockVerifyMessage).toHaveBeenCalled();
    expect(mockDecryptMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        armoredSignature: "sig",
        expectSigned: true,
      }),
    );
  });

  test("decryptCards rejects failed signed-card verification", async () => {
    mockVerifyMessage.mockImplementation(async () => ({ verificationStatus: 2 }));
    await expect(
      decryptCards(
        [{ Type: CardSigned, Data: "plain", Signature: "bad-sig" }],
        userKey,
      ),
    ).rejects.toThrow(/signature verification failed/i);
  });

  test("decryptCards rejects missing signatures on signed cards", async () => {
    await expect(
      decryptCards([{ Type: CardSigned, Data: "plain" }], userKey),
    ).rejects.toThrow(/signature missing/i);
  });

  test("decryptCards rejects failed encrypted+signed verification", async () => {
    mockDecryptMessage.mockImplementation(async () => ({
      data: new TextEncoder().encode("decrypted"),
      verificationStatus: 2,
    }));
    await expect(
      decryptCards(
        [{ Type: CardEncryptedSigned, Data: "cipher", Signature: "bad" }],
        userKey,
      ),
    ).rejects.toThrow(/signature verification failed/i);
  });
});
