import { randomBytes } from "node:crypto";
import type { CryptoKeyRing } from "../types.ts";
import type { SessionKeyMaterial } from "./proxy.ts";
import { getShareSrpModule } from "../../shims/proton-srp-share.ts";
import {
  base64ToBytes,
  bytesToBase64,
  getDriveCrypto,
} from "./proxy.ts";

const GENERATED_PASSWORD_LEN = 12;
const PASSWORD_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const FLAG_GENERATED_PASSWORD = 2;
const FLAG_CUSTOM_PASSWORD = 1;
const FLAG_CUSTOM_AND_GENERATED = 3;
const PERM_VIEW = 4;
const PERM_EDIT = 6;
const SIG_CONTEXT_INVITER = "drive.share-member.inviter";
const SIG_CONTEXT_MEMBER = "drive.share-member.member";

export function shareRoleLabel(perms: number): string {
  return perms & 2 ? "editor" : "viewer";
}

export function permFor(canEdit: boolean): number {
  return canEdit ? PERM_EDIT : PERM_VIEW;
}

export function randomSharePassword(length = GENERATED_PASSWORD_LEN): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_CHARSET[bytes[i]! % PASSWORD_CHARSET.length];
  }
  return out;
}

function bytesToBinaryString(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

export interface LinkPasswordOptions {
  canEdit?: boolean;
  setEdit?: boolean;
  expireSeconds?: number;
  setExpiry?: boolean;
  customPassword?: string;
  setPassword?: boolean;
}

export function composeSharePassword(
  generated: string,
  opts: LinkPasswordOptions,
): { full: string; flags: number; custom: string } {
  if (opts.setPassword && opts.customPassword) {
    return {
      full: generated + opts.customPassword,
      flags: FLAG_CUSTOM_AND_GENERATED,
      custom: opts.customPassword,
    };
  }
  return { full: generated, flags: FLAG_GENERATED_PASSWORD, custom: "" };
}

export async function buildShareUrlPasswordFields(
  sessionKey: SessionKeyMaterial,
  fullPassword: string,
  addressKeys: CryptoKeyRing,
  fetchModulus: () => Promise<{ modulus: string; modulusId: string }>,
): Promise<Record<string, unknown>> {
  const crypto = await getDriveCrypto();
  const shareSalt = randomBytes(16);
  const { hashPassword, verifyAndGetModulus, getRandomSrpVerifier } =
    await getShareSrpModule();

  const mod = await fetchModulus();
  const modulus = await verifyAndGetModulus(mod.modulus);
  const hashed = await hashPassword({
    version: 3,
    password: fullPassword,
    salt: bytesToBinaryString(shareSalt),
    modulus,
  });
  const keyPass = bytesToBinaryString(hashed.slice(-31));

  const extended = crypto as typeof crypto & {
    encryptSessionKey: (opts: {
      data: Uint8Array;
      algorithm: string;
      passwords?: string[];
      format?: "binary";
    }) => Promise<Uint8Array | string>;
  };
  const keyPacket = await extended.encryptSessionKey({
    data: sessionKey.data,
    algorithm: sessionKey.algorithm,
    passwords: [keyPass],
    format: "binary",
  });
  const keyPacketB64 = bytesToBase64(
    keyPacket instanceof Uint8Array ? keyPacket : base64ToBytes(String(keyPacket)),
  );

  const { message: encPassword } = await crypto.encryptMessage({
    textData: fullPassword,
    encryptionKeys: addressKeys,
    format: "armored",
  });

  const urlSalt = randomBytes(10);
  const srp = await getRandomSrpVerifier(
    { Modulus: mod.modulus },
    { username: "share-url", password: fullPassword },
    4,
  );

  return {
    SharePassphraseKeyPacket: keyPacketB64,
    SharePasswordSalt: bytesToBase64(shareSalt),
    Password: String(encPassword),
    SRPModulusID: mod.modulusId,
    SRPVerifier: srp.verifier,
    UrlPasswordSalt: srp.salt,
  };
}

export async function decryptShareUrlPassword(
  armoredPassword: string,
  flags: number,
  addressKeys: CryptoKeyRing,
): Promise<{ generated: string; custom: string }> {
  if (!armoredPassword) return { generated: "", custom: "" };
  const crypto = await getDriveCrypto();
  const { data } = await crypto.decryptMessage({
    armoredMessage: armoredPassword,
    decryptionKeys: addressKeys,
    format: "utf8",
  });
  const full = String(data);
  if (flags & FLAG_GENERATED_PASSWORD && full.length >= GENERATED_PASSWORD_LEN) {
    const generated = full.slice(0, GENERATED_PASSWORD_LEN);
    const custom =
      flags & FLAG_CUSTOM_PASSWORD ? full.slice(GENERATED_PASSWORD_LEN) : "";
    return { generated, custom };
  }
  return { generated: full, custom: "" };
}

export async function signInviteKeyPacket(
  keyPacket: Uint8Array,
  addressKeys: CryptoKeyRing,
): Promise<string> {
  const crypto = await getDriveCrypto();
  const extended = crypto as typeof crypto & {
    signMessage: (opts: {
      binaryData: Uint8Array;
      signingKeys: CryptoKeyRing;
      signingContext?: { value: string; critical: boolean };
      detached?: boolean;
      format?: "binary";
    }) => Promise<{ signature: Uint8Array | string }>;
  };
  const { signature } = await extended.signMessage({
    binaryData: keyPacket,
    signingKeys: addressKeys,
    signingContext: { value: SIG_CONTEXT_INVITER, critical: true },
    detached: true,
    format: "binary",
  });
  const sigBytes =
    signature instanceof Uint8Array ? signature : base64ToBytes(String(signature));
  return bytesToBase64(sigBytes);
}

export async function signAcceptSessionKey(
  sessionKeyBytes: Uint8Array,
  addressKeys: CryptoKeyRing,
): Promise<string> {
  const crypto = await getDriveCrypto();
  const extended = crypto as typeof crypto & {
    signMessage: (opts: {
      binaryData: Uint8Array;
      signingKeys: CryptoKeyRing;
      signingContext?: { value: string; critical: boolean };
      detached?: boolean;
      format?: "binary";
    }) => Promise<{ signature: Uint8Array | string }>;
  };
  const { signature } = await extended.signMessage({
    binaryData: sessionKeyBytes,
    signingKeys: addressKeys,
    signingContext: { value: SIG_CONTEXT_MEMBER, critical: true },
    detached: true,
    format: "binary",
  });
  const sigBytes =
    signature instanceof Uint8Array ? signature : base64ToBytes(String(signature));
  return bytesToBase64(sigBytes);
}

export async function encryptSessionKeyForPublicKeys(
  sessionKey: SessionKeyMaterial,
  publicKeysArmored: string[],
): Promise<string> {
  const crypto = await getDriveCrypto();
  const encryptionKeys: unknown[] = [];
  for (const armored of publicKeysArmored) {
    encryptionKeys.push(await crypto.importPublicKey({ armoredKey: armored }));
  }
  const keyPacket = await crypto.encryptSessionKey({
    data: sessionKey.data,
    algorithm: sessionKey.algorithm,
    encryptionKeys,
    format: "binary",
  });
  return bytesToBase64(
    keyPacket instanceof Uint8Array ? keyPacket : base64ToBytes(String(keyPacket)),
  );
}
