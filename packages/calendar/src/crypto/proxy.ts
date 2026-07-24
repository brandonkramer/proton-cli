import { ensureCryptoProxy } from "@bkramer/proton-core";
import type { SessionKeyMaterial } from "./types.ts";

export type CryptoKey = unknown;

export interface CalendarCryptoProxy {
  importPrivateKey: (options: {
    armoredKey: string;
    passphrase: string | null;
  }) => Promise<CryptoKey>;
  importPublicKey: (options: { armoredKey: string }) => Promise<CryptoKey>;
  exportPrivateKey: (options: {
    privateKey: CryptoKey;
    passphrase: string;
  }) => Promise<string>;
  generateKey: (options: {
    userIDs: { name: string; email?: string }[];
    type?: string;
    passphrase?: string;
  }) => Promise<CryptoKey>;
  decryptMessage: (options: Record<string, unknown>) => Promise<{
    data: string | Uint8Array;
    verificationStatus?: number;
  }>;
  encryptMessage: (options: Record<string, unknown>) => Promise<{
    message: string | Uint8Array;
    signature?: Uint8Array;
  }>;
  signMessage: (options: Record<string, unknown>) => Promise<{ signature: string | Uint8Array }>;
  verifyMessage: (options: Record<string, unknown>) => Promise<{
    verificationStatus: number;
    data?: string | Uint8Array;
  }>;
  getArmoredSignature: (options: { binarySignature: Uint8Array }) => Promise<string>;
  encryptSessionKey: (options: Record<string, unknown>) => Promise<string | Uint8Array>;
  decryptSessionKey: (options: Record<string, unknown>) => Promise<SessionKeyMaterial>;
  generateSessionKey: (options?: Record<string, unknown>) => Promise<SessionKeyMaterial>;
}

/** Full CryptoProxy after shared core init (REQ-CAL-003). */
export async function getCalendarCrypto(): Promise<CalendarCryptoProxy> {
  await ensureCryptoProxy();
  const cryptoId = "@protontech/" + "crypto";
  const mod = (await import(cryptoId)) as {
    CryptoProxy: CalendarCryptoProxy;
  };
  return mod.CryptoProxy;
}
