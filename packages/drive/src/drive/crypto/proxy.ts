import { getCryptoProxy as getCoreCryptoProxy } from "@bkramer/proton-core";

export type CryptoKey = unknown;

export interface SessionKeyMaterial {
  data: Uint8Array;
  algorithm: string;
}

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
    format?: "utf8" | "binary";
    expectSigned?: boolean;
  }) => Promise<{ data: string | Uint8Array }>;
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

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

export function sha256Base64(data: Uint8Array): string {
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(data);
  return hash.digest("base64");
}

export function sha256Raw(data: Uint8Array): Uint8Array {
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(data);
  return new Uint8Array(hash.digest());
}
