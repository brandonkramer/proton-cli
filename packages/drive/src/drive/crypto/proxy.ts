import { getCryptoProxy as getCoreCryptoProxy } from "@bkramer/proton-core";

export type CryptoKey = unknown;

export interface SessionKeyMaterial {
  data: Uint8Array;
  algorithm: string;
}

/** Mirrors @protontech/crypto VERIFICATION_STATUS. */
export const VERIFICATION_STATUS = {
  NOT_SIGNED: 0,
  SIGNED_AND_VALID: 1,
  SIGNED_AND_INVALID: 2,
} as const;

export interface DriveCryptoProxy {
  importPrivateKey: (options: {
    armoredKey: string;
    passphrase: string | null;
  }) => Promise<CryptoKey>;
  importPublicKey: (options: { armoredKey: string }) => Promise<CryptoKey>;
  decryptMessage: (options: {
    armoredMessage?: string;
    binaryMessage?: Uint8Array;
    decryptionKeys?: CryptoKey | CryptoKey[];
    verificationKeys?: CryptoKey | CryptoKey[];
    sessionKeys?: SessionKeyMaterial[];
    armoredSignature?: string;
    binarySignature?: Uint8Array;
    armoredEncryptedSignature?: string;
    binaryEncryptedSignature?: Uint8Array;
    format?: "utf8" | "binary";
    expectSigned?: boolean;
  }) => Promise<{
    data: string | Uint8Array;
    verificationStatus?: number;
  }>;
  encryptMessage: (options: {
    textData?: string;
    binaryData?: Uint8Array;
    encryptionKeys?: CryptoKey | CryptoKey[];
    signingKeys?: CryptoKey | CryptoKey[];
    sessionKey?: SessionKeyMaterial;
    format?: "armored" | "binary";
  }) => Promise<{ message: string | Uint8Array }>;
  signMessage: (options: {
    textData?: string;
    binaryData?: Uint8Array;
    signingKeys: CryptoKey | CryptoKey[];
    detached?: boolean;
    format?: "armored" | "binary";
  }) => Promise<{ signature: string | Uint8Array }>;
  verifyMessage: (options: {
    textData?: string;
    binaryData?: Uint8Array;
    armoredSignature?: string;
    binarySignature?: Uint8Array;
    verificationKeys: CryptoKey | CryptoKey[];
    format?: "utf8" | "binary";
  }) => Promise<{ verificationStatus: number }>;
  generateKey: (options: {
    userIDs: { name: string; email: string }[];
    type?: "x25519" | "rsa";
    passphrase?: string;
  }) => Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }>;
  encryptSessionKey: (options: {
    data?: Uint8Array;
    algorithm?: string;
    encryptionKeys: CryptoKey | CryptoKey[];
    format?: "armored" | "binary";
  }) => Promise<string | Uint8Array>;
  decryptSessionKey: (options: {
    armoredMessage?: string;
    binaryMessage?: Uint8Array;
    decryptionKeys: CryptoKey | CryptoKey[];
  }) => Promise<SessionKeyMaterial>;
  generateSessionKey: (options?: {
    algorithm?: string;
  }) => Promise<SessionKeyMaterial>;
}

export async function getDriveCrypto(): Promise<DriveCryptoProxy> {
  return (await getCoreCryptoProxy()) as unknown as DriveCryptoProxy;
}
