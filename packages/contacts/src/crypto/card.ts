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

const SIGNED_AND_VALID = 1;

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
    verificationKeys?: unknown[];
    armoredSignature?: string;
    format?: "binary" | "armored";
    expectSigned?: boolean;
  }) => Promise<{ data: Uint8Array | string; verificationStatus?: number }>;
  encryptMessage: (options: {
    binaryData?: Uint8Array;
    textData?: string;
    encryptionKeys: unknown[];
    signingKeys?: unknown[];
    format?: "armored" | "binary";
  }) => Promise<{ message: Uint8Array | string }>;
  verifyMessage: (options: {
    binaryData?: Uint8Array;
    textData?: string;
    armoredSignature: string;
    verificationKeys: unknown[];
    format?: "utf8" | "binary";
  }) => Promise<{ verificationStatus: number }>;
}

async function crypto(): Promise<CryptoWithSign> {
  return (await getCryptoProxy()) as unknown as CryptoWithSign;
}

function armoredSignature(result: string | { signature?: string; message?: string }): string {
  if (typeof result === "string") return result;
  return result.signature ?? result.message ?? "";
}

function requireSignature(card: ContactCard, label: string): string {
  const signature = card.Signature?.trim();
  if (!signature) {
    throw new Error(`Contact card signature missing (${label}).`);
  }
  return signature;
}

async function verifyDetached(
  data: string,
  signature: string,
  verificationKey: unknown,
): Promise<void> {
  const proxy = await crypto();
  const { verificationStatus } = await proxy.verifyMessage({
    binaryData: textToBytes(data),
    armoredSignature: signature,
    verificationKeys: [verificationKey],
    format: "binary",
  });
  if (verificationStatus !== SIGNED_AND_VALID) {
    throw new Error("Contact card signature verification failed.");
  }
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
      case CardSigned: {
        const signature = requireSignature(card, "signed");
        await verifyDetached(card.Data, signature, userKey.publicKey);
        out.push(card.Data);
        break;
      }
      case CardEncrypted: {
        const { data } = await proxy.decryptMessage({
          armoredMessage: card.Data,
          decryptionKeys: [userKey.privateKey],
          format: "binary",
          expectSigned: false,
        });
        out.push(typeof data === "string" ? data : bytesToText(data));
        break;
      }
      case CardEncryptedSigned: {
        const signature = requireSignature(card, "encrypted+signed");
        const { data, verificationStatus } = await proxy.decryptMessage({
          armoredMessage: card.Data,
          decryptionKeys: [userKey.privateKey],
          verificationKeys: [userKey.publicKey],
          armoredSignature: signature,
          format: "binary",
          expectSigned: true,
        });
        if (verificationStatus !== undefined && verificationStatus !== SIGNED_AND_VALID) {
          throw new Error("Contact card signature verification failed.");
        }
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
