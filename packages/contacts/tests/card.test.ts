import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { DecryptedUserKey } from "@bkramer/proton-core";
import { CardEncryptedSigned, CardSigned } from "../src/vcard/vcard.ts";

const mockSignMessage = mock(async () => "-----BEGIN PGP SIGNATURE-----\nsig\n-----END PGP SIGNATURE-----");
const mockEncryptMessage = mock(async () => ({
  message: "-----BEGIN PGP MESSAGE-----\ncipher\n-----END PGP MESSAGE-----",
}));
const mockDecryptMessage = mock(async () => ({ data: new TextEncoder().encode("decrypted") }));

mock.module("../src/crypto/proxy.ts", () => ({
  getCryptoProxy: async () => ({
    setEndpoint: () => {},
    importPrivateKey: async () => ({}),
    importPublicKey: async () => ({}),
    signMessage: mockSignMessage,
    encryptMessage: mockEncryptMessage,
    decryptMessage: mockDecryptMessage,
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

  test("decryptCards decrypts encrypted cards", async () => {
    const plaintext = await decryptCards(
      [
        { Type: CardSigned, Data: "plain" },
        { Type: CardEncryptedSigned, Data: "cipher", Signature: "sig" },
      ],
      userKey,
    );
    expect(plaintext).toEqual(["plain", "decrypted"]);
  });
});
