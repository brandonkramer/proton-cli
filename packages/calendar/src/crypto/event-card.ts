import { getCalendarCrypto } from "./proxy.ts";
import {
  base64ToBytes,
  bytesToBase64,
  CardEncryptedSigned,
  CardSigned,
  type EventCard,
  type SessionKeyMaterial,
} from "./types.ts";

const SIGNED_AND_VALID = 1;

async function crypto() {
  return getCalendarCrypto();
}

function requireSignature(card: EventCard, label: string): string {
  const signature = card.Signature?.trim();
  if (!signature) {
    throw new Error(`Event card signature missing (${label}).`);
  }
  return signature;
}

async function verifyDetached(
  data: string,
  signature: string,
  verificationKey: unknown,
): Promise<void> {
  const proxy = await crypto();
  const result = await proxy.verifyMessage({
    textData: data,
    armoredSignature: signature,
    verificationKeys: [verificationKey],
  });
  const status = (result as { verificationStatus?: number }).verificationStatus;
  if (status !== SIGNED_AND_VALID) {
    throw new Error("Event card signature verification failed.");
  }
}

export async function signCard(
  data: string,
  signingKey: unknown,
): Promise<EventCard> {
  const proxy = await crypto();
  const { signature } = await proxy.signMessage({
    textData: data,
    signingKeys: [signingKey],
    detached: true,
    format: "armored",
  });
  return { Type: CardSigned, Data: data, Signature: String(signature) };
}

async function decryptCardData(
  data: string,
  keyPacket: Uint8Array | null,
  decryptionKey: unknown,
  signature: string,
  verificationKey: unknown,
): Promise<string> {
  const proxy = await crypto();
  if (keyPacket) {
    let dataPacket: Uint8Array;
    try {
      dataPacket = base64ToBytes(data);
    } catch {
      const { data: plain, verificationStatus } = (await proxy.decryptMessage({
        armoredMessage: data,
        decryptionKeys: [decryptionKey],
        verificationKeys: [verificationKey],
        armoredSignature: signature,
        format: "utf8",
        expectSigned: true,
      })) as { data: string | Uint8Array; verificationStatus?: number };
      if (
        verificationStatus !== undefined &&
        verificationStatus !== SIGNED_AND_VALID
      ) {
        throw new Error("Event card signature verification failed.");
      }
      return String(plain);
    }
    const sessionKey = await proxy.decryptSessionKey({
      binaryMessage: keyPacket,
      decryptionKeys: [decryptionKey],
    });
    const { data: plain, verificationStatus } = (await proxy.decryptMessage({
      binaryMessage: dataPacket,
      sessionKeys: [sessionKey],
      verificationKeys: [verificationKey],
      armoredSignature: signature,
      format: "utf8",
      expectSigned: true,
    })) as { data: string | Uint8Array; verificationStatus?: number };
    if (
      verificationStatus !== undefined &&
      verificationStatus !== SIGNED_AND_VALID
    ) {
      throw new Error("Event card signature verification failed.");
    }
    return String(plain);
  }
  const { data: plain, verificationStatus } = (await proxy.decryptMessage({
    armoredMessage: data,
    decryptionKeys: [decryptionKey],
    verificationKeys: [verificationKey],
    armoredSignature: signature,
    format: "utf8",
    expectSigned: true,
  })) as { data: string | Uint8Array; verificationStatus?: number };
  if (
    verificationStatus !== undefined &&
    verificationStatus !== SIGNED_AND_VALID
  ) {
    throw new Error("Event card signature verification failed.");
  }
  return String(plain);
}

export async function decryptCards(
  cards: EventCard[],
  decryptionKey: unknown,
  verificationKey: unknown,
  keyPacketB64: string,
): Promise<string[]> {
  const keyPacket = keyPacketB64 ? base64ToBytes(keyPacketB64) : null;
  const out: string[] = [];
  for (const card of cards) {
    switch (card.Type) {
      case CardSigned: {
        const signature = requireSignature(card, "signed");
        await verifyDetached(card.Data, signature, verificationKey);
        out.push(card.Data);
        break;
      }
      case CardEncryptedSigned: {
        const signature = requireSignature(card, "encrypted+signed");
        const plain = await decryptCardData(
          card.Data,
          keyPacket,
          decryptionKey,
          signature,
          verificationKey,
        );
        out.push(plain);
        break;
      }
      default:
        out.push(card.Data);
    }
  }
  return out;
}

export async function encryptAndSignCardSplit(
  signedData: string,
  encryptedData: string,
  calendarPrivateKey: unknown,
  addressPrivateKey: unknown,
  existingKeyPacketB64?: string,
): Promise<{
  signedCard: EventCard;
  encryptedCard: EventCard;
  sharedKeyPacket: string;
  sessionKey: SessionKeyMaterial;
}> {
  const proxy = await crypto();
  const signedCard = await signCard(signedData, addressPrivateKey);

  let sessionKey: SessionKeyMaterial;
  let sharedKeyPacket = "";
  if (existingKeyPacketB64) {
    sessionKey = await proxy.decryptSessionKey({
      binaryMessage: base64ToBytes(existingKeyPacketB64),
      decryptionKeys: [calendarPrivateKey],
    });
  } else {
    sessionKey = await proxy.generateSessionKey({});
    const keyPacket = await proxy.encryptSessionKey({
      data: sessionKey.data,
      algorithm: sessionKey.algorithm,
      encryptionKeys: [calendarPrivateKey],
      format: "binary",
    });
    sharedKeyPacket = bytesToBase64(
      keyPacket instanceof Uint8Array ? keyPacket : base64ToBytes(String(keyPacket)),
    );
  }

  const { message: dataPacket } = await proxy.encryptMessage({
    textData: encryptedData,
    sessionKey,
    format: "binary",
  });
  const dataBytes =
    dataPacket instanceof Uint8Array ? dataPacket : base64ToBytes(String(dataPacket));

  const { signature } = await proxy.signMessage({
    textData: encryptedData,
    signingKeys: [addressPrivateKey],
    detached: true,
    format: "armored",
  });

  return {
    signedCard,
    encryptedCard: {
      Type: CardEncryptedSigned,
      Data: bytesToBase64(dataBytes),
      Signature: String(signature),
    },
    sharedKeyPacket,
    sessionKey,
  };
}

export async function encryptPartWithSessionKey(
  data: string,
  sessionKey: SessionKeyMaterial,
  signingKey: unknown,
): Promise<EventCard> {
  const proxy = await crypto();
  const { message: dataPacket } = await proxy.encryptMessage({
    textData: data,
    sessionKey,
    format: "binary",
  });
  const dataBytes =
    dataPacket instanceof Uint8Array ? dataPacket : base64ToBytes(String(dataPacket));
  const { signature } = await proxy.signMessage({
    textData: data,
    signingKeys: [signingKey],
    detached: true,
    format: "armored",
  });
  return {
    Type: CardEncryptedSigned,
    Data: bytesToBase64(dataBytes),
    Signature: String(signature),
  };
}

export async function encryptSessionKeyForRecipient(
  sessionKey: SessionKeyMaterial,
  recipientPublicKey: unknown,
): Promise<string> {
  const proxy = await crypto();
  const keyPacket = await proxy.encryptSessionKey({
    data: sessionKey.data,
    algorithm: sessionKey.algorithm,
    encryptionKeys: [recipientPublicKey],
    format: "binary",
  });
  return bytesToBase64(
    keyPacket instanceof Uint8Array ? keyPacket : base64ToBytes(String(keyPacket)),
  );
}

export { cardFromRaw } from "./types.ts";
