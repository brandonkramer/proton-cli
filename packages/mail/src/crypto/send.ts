import { getCryptoProxy } from "./proxy.ts";
import type { UnlockedAddressKey } from "./unlock.ts";
import { CliError } from "../util/errors.ts";

/** Proton PACKAGE_TYPE bitflags. */
export const PACKAGE_TYPE = {
  SEND_PM: 1,
  SEND_EO: 2,
  SEND_CLEAR: 4,
  SEND_PGP_INLINE: 8,
  SEND_PGP_MIME: 16,
  SEND_CLEAR_MIME: 32,
} as const;

export const SIGNATURE_TYPE = {
  NONE: 0,
  DETACHED: 1,
  ATTACHED: 2,
} as const;

export interface SessionKeyMaterial {
  data: Uint8Array;
  algorithm: string;
}

export interface RecipientKeyPref {
  email: string;
  /** Imported public keys; empty → cleartext package (external). */
  publicKeys: unknown[];
}

export interface SendPackageRecipient {
  Type: number;
  Signature: number;
  BodyKeyPacket?: string;
  AttachmentKeyPackets?: Record<string, string>;
}

export interface SendPackage {
  Addresses: Record<string, SendPackageRecipient>;
  MIMEType: string;
  Type: number;
  Body: string;
  BodyKey?: { Key: string; Algorithm: string };
  AttachmentKeys?: Record<string, { Key: string; Algorithm: string }>;
}

export interface EncryptSendResult {
  /** Armored ciphertext for draft Message.Body (INV-E2EE-001). */
  draftBody: string;
  packages: SendPackage[];
  mimeType: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function asBytes(value: string | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) return value;
  // base64 or raw string from CryptoProxy
  try {
    const bin = atob(value);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new TextEncoder().encode(value);
  }
}

export interface EncryptForSendOptions {
  plaintext: string;
  mimeType?: string;
  senderKey: UnlockedAddressKey;
  recipients: RecipientKeyPref[];
  /** Injected for tests. */
  cryptoProxy?: Awaited<ReturnType<typeof getCryptoProxy>> & {
    generateSessionKey?: (options?: Record<string, unknown>) => Promise<SessionKeyMaterial>;
    encryptSessionKey?: (options: Record<string, unknown>) => Promise<string | Uint8Array>;
  };
}

/**
 * Encrypt plaintext for draft + send packages.
 * Draft Body is always ciphertext (never plaintext upload — INV-E2EE-001).
 */
export async function encryptForSend(
  options: EncryptForSendOptions,
): Promise<EncryptSendResult> {
  const mimeType = options.mimeType ?? "text/plain";
  const proxy = options.cryptoProxy ?? (await getCryptoProxy());
  const generateSessionKey = (
    proxy as {
      generateSessionKey?: (options?: Record<string, unknown>) => Promise<SessionKeyMaterial>;
    }
  ).generateSessionKey;
  const encryptSessionKey = (
    proxy as {
      encryptSessionKey?: (options: Record<string, unknown>) => Promise<string | Uint8Array>;
    }
  ).encryptSessionKey;

  if (!generateSessionKey || !encryptSessionKey) {
    throw new CliError(
      "CryptoProxy missing generateSessionKey/encryptSessionKey for mail send.",
    );
  }

  const uniqueRecipients = dedupeRecipients(options.recipients);
  if (uniqueRecipients.length === 0) {
    throw new CliError("At least one recipient is required to send.");
  }

  // Draft: encrypt to sender address key only (re-openable).
  const draft = await proxy.encryptMessage({
    textData: options.plaintext,
    encryptionKeys: [options.senderKey.publicKey],
    signingKeys: [options.senderKey.privateKey],
    format: "armored",
  } as never);
  const draftBody = String(
    (draft as { message: string | Uint8Array }).message,
  );
  if (
    !draftBody.includes("-----BEGIN PGP MESSAGE-----") &&
    options.plaintext.length > 0
  ) {
    throw new CliError("Draft encryption failed: plaintext would be uploaded.");
  }

  const encryptionKeysForSession = [
    options.senderKey.publicKey,
    ...uniqueRecipients.flatMap((r) => r.publicKeys),
  ];

  const sessionKey = await generateSessionKey({
    recipientKeys: encryptionKeysForSession,
  });

  const encrypted = await proxy.encryptMessage({
    textData: options.plaintext,
    sessionKey,
    signingKeys: [options.senderKey.privateKey],
    format: "binary",
  } as never);
  const dataPacket = asBytes(
    (encrypted as { message: string | Uint8Array }).message,
  );
  const bodyB64 = bytesToBase64(dataPacket);

  const addresses: Record<string, SendPackageRecipient> = {};
  let packageType = 0;
  let needsClearBodyKey = false;

  for (const recipient of uniqueRecipients) {
    const email = recipient.email.trim().toLowerCase();
    if (recipient.publicKeys.length > 0) {
      const keyPacket = await encryptSessionKey({
        data: sessionKey.data,
        algorithm: sessionKey.algorithm,
        encryptionKeys: [recipient.publicKeys[0]],
        format: "binary",
      });
      const keyBytes = asBytes(keyPacket);
      addresses[email] = {
        Type: PACKAGE_TYPE.SEND_PM,
        Signature: SIGNATURE_TYPE.DETACHED,
        BodyKeyPacket: bytesToBase64(keyBytes),
      };
      packageType |= PACKAGE_TYPE.SEND_PM;
    } else {
      addresses[email] = {
        Type: PACKAGE_TYPE.SEND_CLEAR,
        Signature: SIGNATURE_TYPE.DETACHED,
      };
      packageType |= PACKAGE_TYPE.SEND_CLEAR;
      needsClearBodyKey = true;
    }
  }

  const pack: SendPackage = {
    Addresses: addresses,
    MIMEType: mimeType,
    Type: packageType,
    Body: bodyB64,
  };

  if (needsClearBodyKey) {
    pack.BodyKey = {
      Key: bytesToBase64(sessionKey.data),
      Algorithm: sessionKey.algorithm || "aes256",
    };
  }

  return { draftBody, packages: [pack], mimeType };
}

function dedupeRecipients(recipients: RecipientKeyPref[]): RecipientKeyPref[] {
  const seen = new Set<string>();
  const out: RecipientKeyPref[] = [];
  for (const recipient of recipients) {
    const key = recipient.email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ email: key, publicKeys: recipient.publicKeys });
  }
  return out;
}

/** Guard used by tests / callers: reject plaintext Body uploads. */
export function assertEncryptedBody(body: string): void {
  if (!body.includes("-----BEGIN PGP MESSAGE-----")) {
    throw new CliError(
      "Refusing to upload plaintext Body (INV-E2EE-001).",
    );
  }
}
