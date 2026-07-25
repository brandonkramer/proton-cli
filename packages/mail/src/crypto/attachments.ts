import { basename } from "node:path";
import { getCryptoProxy } from "./proxy.ts";
import type { SessionKeyMaterial } from "./send.ts";
import type { UnlockedAddressKey } from "./unlock.ts";
import { CliError } from "../util/errors.ts";

export interface EncryptedAttachmentFile {
  filename: string;
  mimeType: string;
  size: number;
  /** Session-key packet encrypted to sender address key. */
  keyPackets: Uint8Array;
  /** File ciphertext. */
  dataPacket: Uint8Array;
  /** Detached signature over plaintext. */
  signature: Uint8Array;
  /** Keep for send-package re-wrap to recipients. */
  sessionKey: SessionKeyMaterial;
}

function asBytes(value: string | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) return value;
  try {
    const bin = atob(value);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new TextEncoder().encode(value);
  }
}

const EXT_MIME: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".htm": "text/html",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".json": "application/json",
  ".csv": "text/csv",
  ".zip": "application/zip",
};

export function guessMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return "application/octet-stream";
  return EXT_MIME[lower.slice(dot)] ?? "application/octet-stream";
}

/** Encrypt a local file for Proton Mail attachment upload. */
export async function encryptAttachmentFile(options: {
  path: string;
  bytes: Uint8Array;
  senderKey: UnlockedAddressKey;
  cryptoProxy?: Awaited<ReturnType<typeof getCryptoProxy>> & {
    generateSessionKey?: (options?: Record<string, unknown>) => Promise<SessionKeyMaterial>;
    encryptSessionKey?: (options: Record<string, unknown>) => Promise<string | Uint8Array>;
  };
}): Promise<EncryptedAttachmentFile> {
  const filename = basename(options.path);
  const mimeType = guessMimeType(filename);
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
      "CryptoProxy missing generateSessionKey/encryptSessionKey for attachments.",
    );
  }

  const sessionKey = await generateSessionKey({
    recipientKeys: [options.senderKey.publicKey],
  });

  const encrypted = await proxy.encryptMessage({
    binaryData: options.bytes,
    sessionKey,
    signingKeys: [options.senderKey.privateKey],
    format: "binary",
    detached: true,
  } as never);

  const dataPacket = asBytes(
    (encrypted as { message: string | Uint8Array }).message,
  );
  const signatureRaw = (encrypted as { signature?: string | Uint8Array })
    .signature;
  if (!signatureRaw) {
    throw new CliError(`Failed to sign attachment ${filename}.`);
  }
  const signature = asBytes(signatureRaw);

  const keyPacket = await encryptSessionKey({
    data: sessionKey.data,
    algorithm: sessionKey.algorithm,
    encryptionKeys: [options.senderKey.publicKey],
    format: "binary",
  });

  return {
    filename,
    mimeType,
    size: options.bytes.byteLength,
    keyPackets: asBytes(keyPacket),
    dataPacket,
    signature,
    sessionKey,
  };
}
