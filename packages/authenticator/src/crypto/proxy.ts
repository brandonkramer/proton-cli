/**
 * Initializes CryptoProxy (required for SRP modulus verification and User Key unlock).
 * Module ids are built at runtime so `tsc` does not typecheck Proton's published .ts.
 */

interface CryptoApiLike {
  clearKeyStore: () => Promise<unknown> | unknown;
}

interface CryptoApiConstructor {
  new (): CryptoApiLike;
  init: (options: Record<string, never>) => void;
}

interface CryptoProxyLike {
  setEndpoint: (
    endpoint: CryptoApiLike,
    onRelease?: (endpoint: CryptoApiLike) => unknown,
  ) => void;
  importPrivateKey: (options: {
    armoredKey: string;
    passphrase: string | null;
  }) => Promise<unknown>;
  importPublicKey: (options: { armoredKey: string }) => Promise<unknown>;
  encryptMessage: (options: {
    binaryData: Uint8Array;
    encryptionKeys: unknown[];
    signingKeys: unknown[];
    format: "binary";
  }) => Promise<{ message: Uint8Array }>;
  decryptMessage: (options: {
    binaryMessage: Uint8Array;
    decryptionKeys: unknown[];
    verificationKeys: unknown[];
    format: "binary";
    expectSigned: boolean;
  }) => Promise<{ data: Uint8Array }>;
}

let cryptoReady: Promise<CryptoProxyLike> | null = null;

export async function getCryptoProxy(): Promise<CryptoProxyLike> {
  if (cryptoReady) return cryptoReady;

  cryptoReady = (async () => {
    const cryptoId = "@protontech/" + "crypto";
    const apiId = "@protontech/" + "crypto/proxy/endpoint/api.ts";

    const { CryptoProxy } = (await import(cryptoId)) as {
      CryptoProxy: CryptoProxyLike;
    };
    const { Api: CryptoApi } = (await import(apiId)) as {
      Api: CryptoApiConstructor;
    };

    CryptoApi.init({});
    CryptoProxy.setEndpoint(new CryptoApi(), (endpoint) =>
      endpoint.clearKeyStore(),
    );
    return CryptoProxy;
  })();

  try {
    return await cryptoReady;
  } catch (error) {
    cryptoReady = null;
    throw error;
  }
}

export interface AuthInfo {
  Version: number;
  Modulus: string;
  ServerEphemeral: string;
  Username?: string;
  Salt: string;
}

export interface AuthCredentials {
  username?: string;
  password: string;
}

export interface SrpProofs {
  clientEphemeral: string;
  clientProof: string;
  expectedServerProof: string;
  sharedSession: Uint8Array;
}

type GetSrp = (
  info: AuthInfo,
  credentials: AuthCredentials,
  authVersion?: number,
) => Promise<SrpProofs>;

export async function getSrp(
  info: AuthInfo,
  credentials: AuthCredentials,
  authVersion?: number,
): Promise<SrpProofs> {
  await getCryptoProxy();
  const srpId = "@protontech/" + "crypto/srp";
  const mod = (await import(srpId)) as { getSrp: GetSrp };
  return mod.getSrp(info, credentials, authVersion);
}

type ComputeKeyPassword = (password: string, salt: string) => Promise<string>;

/**
 * Derive the User Key passphrase (bcrypt) from the account password + KeySalt.
 * Required in Single Password Mode — keys are not encrypted with the raw password.
 */
export async function computeKeyPassword(
  password: string,
  salt: string,
): Promise<string> {
  await getCryptoProxy();
  const srpId = "@protontech/" + "crypto/srp";
  const mod = (await import(srpId)) as {
    computeKeyPassword: ComputeKeyPassword;
  };
  return mod.computeKeyPassword(password, salt);
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
