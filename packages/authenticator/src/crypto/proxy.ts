/**
 * Authenticator crypto helpers — CryptoProxy init lives in @bkramer/proton-core
 * so dual-mint with VPN does not double-init.
 */
import { getCryptoProxy } from "@bkramer/proton-core";

export { getCryptoProxy } from "@bkramer/proton-core";

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
