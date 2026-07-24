import type { DecryptedUserKey } from "@bkramer/proton-core";
import { getCryptoProxy } from "./proxy.ts";
import { bytesToText, textToBytes } from "./bytes.ts";
import {
  CardClear,
  CardEncrypted,
  CardEncryptedSigned,
  CardSigned,
  type ContactCard,
} from "../vcard/vcard.ts";

interface CryptoWithSign {
  signMessage: (options: {
    binaryData?: Uint8Array;
    textData?: string;
    signingKeys: unknown[];
    detached?: boolean;
    format?: "armored" | "binary";
  }) => Promise<string | { signature?: string; message?: string }>;
  decryptMessage: (options: {
    armoredMessage?: string;
    binaryMessage?: Uint8Array;
    decryptionKeys: unknown[];
    verificationKeys: unknown[];
    format?: "binary" | "armored";
    expectSigned?: boolean;
  }) => Promise<{ data: Uint8Array | string }>;
  encryptMessage: (options: {
    binaryData?: Uint8Array;
    textData?: string;
    encryptionKeys: unknown[];
    signingKeys?: unknown[];
    format?: "armored" | "binary";
  }) => Promise<{ message: Uint8Array | string }>;
}

async function crypto(): Promise<CryptoWithSign> {
  return (await getCryptoProxy()) as unknown as CryptoWithSign;
}

function armoredSignature(result: string | { signature?: string; message?: string }): string {
  if (typeof result === "string") return result;
  return result.signature ?? result.message ?? "";
}

export async function signCard(
  data: string,
  userKey: DecryptedUserKey,
): Promise<ContactCard> {
  const proxy = await crypto();
  const signature = await proxy.signMessage({
    binaryData: textToBytes(data),
    signingKeys: [userKey.privateKey],
    detached: true,
    format: "armored",
  });
  return {
    Type: CardSigned,
    Data: data,
    Signature: armoredSignature(signature),
  };
}

export async function encryptAndSignCard(
  data: string,
  userKey: DecryptedUserKey,
): Promise<ContactCard> {
  const proxy = await crypto();
  const { message } = await proxy.encryptMessage({
    binaryData: textToBytes(data),
    encryptionKeys: [userKey.publicKey],
    signingKeys: [],
    format: "armored",
  });
  const armored =
    typeof message === "string" ? message : bytesToText(message as Uint8Array);
  const signature = await proxy.signMessage({
    binaryData: textToBytes(data),
    signingKeys: [userKey.privateKey],
    detached: true,
    format: "armored",
  });
  return {
    Type: CardEncryptedSigned,
    Data: armored,
    Signature: armoredSignature(signature),
  };
}

export async function decryptCards(
  cards: ContactCard[],
  userKey: DecryptedUserKey,
): Promise<string[]> {
  const proxy = await crypto();
  const out: string[] = [];
  for (const card of cards) {
    switch (card.Type) {
      case CardClear:
        out.push(card.Data);
        break;
      case CardSigned:
        out.push(card.Data);
        break;
      case CardEncrypted:
      case CardEncryptedSigned: {
        const { data } = await proxy.decryptMessage({
          armoredMessage: card.Data,
          decryptionKeys: [userKey.privateKey],
          verificationKeys: [userKey.publicKey],
          format: "binary",
          expectSigned: false,
        });
        out.push(typeof data === "string" ? data : bytesToText(data));
        break;
      }
      default:
        out.push(card.Data);
    }
  }
  return out;
}

export function cardsFromApi(raw: Array<Record<string, unknown>>): ContactCard[] {
  return raw.map((entry) => ({
    Type: Number(entry.Type ?? CardClear),
    Data: String(entry.Data ?? ""),
    Signature: entry.Signature ? String(entry.Signature) : undefined,
  }));
}
