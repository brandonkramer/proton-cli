import { createHmac, randomBytes } from "node:crypto";
import type { DriveLink } from "../types.ts";
import type { CryptoKey, DriveCryptoProxy, SessionKeyMaterial } from "./proxy.ts";
import {
  base64ToBytes,
  bytesToBase64,
  getDriveCrypto,
  sha256Base64,
} from "./proxy.ts";

type KeyRing = CryptoKey[];

async function crypto(): Promise<DriveCryptoProxy> {
  return getDriveCrypto();
}

function bytesToBinaryPassphrase(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

export async function unlockNodeKey(
  link: DriveLink,
  parentKeys: KeyRing,
): Promise<KeyRing> {
  const proxy = await crypto();
  const { data: passphraseBytes } = await proxy.decryptMessage({
    armoredMessage: link.NodePassphrase,
    decryptionKeys: parentKeys,
    format: "binary",
  });
  const passphrase =
    passphraseBytes instanceof Uint8Array
      ? passphraseBytes
      : new TextEncoder().encode(String(passphraseBytes));

  const locked = await proxy.importPrivateKey({
    armoredKey: link.NodeKey,
    passphrase: bytesToBinaryPassphrase(passphrase),
  });
  return [locked];
}

export async function decryptName(
  encryptedName: string,
  parentKeys: KeyRing,
): Promise<string> {
  const proxy = await crypto();
  const { data } = await proxy.decryptMessage({
    armoredMessage: encryptedName,
    decryptionKeys: parentKeys,
    format: "utf8",
  });
  return String(data);
}

export async function encryptName(
  name: string,
  parentKeys: KeyRing,
  signingKeys: KeyRing,
): Promise<string> {
  const proxy = await crypto();
  const { message } = await proxy.encryptMessage({
    textData: name,
    encryptionKeys: parentKeys,
    signingKeys,
    format: "armored",
  });
  return String(message);
}

export async function hashKeyOf(
  link: DriveLink,
  nodeKeys: KeyRing,
): Promise<Uint8Array> {
  const armored =
    link.AlbumProperties?.NodeHashKey ??
    link.FolderProperties?.NodeHashKey ??
    "";
  if (!armored) {
    throw new Error("Link has no hash key.");
  }
  const proxy = await crypto();
  const { data } = await proxy.decryptMessage({
    armoredMessage: armored,
    decryptionKeys: nodeKeys,
    verificationKeys: nodeKeys,
    format: "binary",
  });
  return data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
}

export function lookupHash(name: string, hashKey: Uint8Array): string {
  return createHmac("sha256", hashKey).update(name.toLowerCase()).digest("hex");
}

export interface GeneratedNodeKeys {
  nodeKeyArmored: string;
  nodePassphraseArmored: string;
  nodePassphraseSignature: string;
  nodePrivateKey: CryptoKey;
}

export async function generateNodeKeys(
  parentKeys: KeyRing,
  signingKeys: KeyRing,
): Promise<GeneratedNodeKeys> {
  const proxy = await crypto();
  const phrase = bytesToBase64(randomBytes(32));
  const { privateKey } = await proxy.generateKey({
    userIDs: [{ name: "Drive key", email: "" }],
    type: "x25519",
    passphrase: phrase,
  });

  const exporter = proxy as DriveCryptoProxy & {
    exportPrivateKey?: (opts: {
      key: CryptoKey;
      format: "armored";
    }) => Promise<string>;
  };
  if (!exporter.exportPrivateKey) {
    throw new Error("CryptoProxy exportPrivateKey unavailable.");
  }
  const nodeKeyArmored = await exporter.exportPrivateKey({
    key: privateKey,
    format: "armored",
  });

  const { message: nodePassphraseArmored } = await proxy.encryptMessage({
    textData: phrase,
    encryptionKeys: parentKeys,
    format: "armored",
  });
  const { signature } = await proxy.signMessage({
    textData: phrase,
    signingKeys,
    detached: true,
    format: "armored",
  });

  return {
    nodeKeyArmored,
    nodePassphraseArmored: String(nodePassphraseArmored),
    nodePassphraseSignature: String(signature),
    nodePrivateKey: privateKey,
  };
}

export async function generateNodeHashKey(
  nodeKeys: KeyRing,
  signingKeys: KeyRing,
): Promise<string> {
  const proxy = await crypto();
  const secret = bytesToBase64(randomBytes(32));
  const { message } = await proxy.encryptMessage({
    textData: secret,
    encryptionKeys: nodeKeys,
    signingKeys,
    format: "armored",
  });
  return String(message);
}

export interface GeneratedFileKeys {
  sessionKey: SessionKeyMaterial;
  contentKeyPacket: string;
  contentKeyPacketSignature: string;
}

export async function generateFileKeys(
  nodeKeys: KeyRing,
): Promise<GeneratedFileKeys> {
  const proxy = await crypto();
  const sessionKey = await proxy.generateSessionKey({ algorithm: "aes256" });
  const encrypted = await proxy.encryptSessionKey({
    data: sessionKey.data,
    algorithm: sessionKey.algorithm,
    encryptionKeys: nodeKeys,
    format: "binary",
  });
  const keyPacket =
    encrypted instanceof Uint8Array ? encrypted : base64ToBytes(String(encrypted));
  const { signature } = await proxy.signMessage({
    binaryData: sessionKey.data,
    signingKeys: nodeKeys,
    detached: true,
    format: "armored",
  });
  return {
    sessionKey,
    contentKeyPacket: bytesToBase64(keyPacket),
    contentKeyPacketSignature: String(signature),
  };
}

export async function encryptBlock(
  data: Uint8Array,
  sessionKey: SessionKeyMaterial,
  nodeKeys: KeyRing,
  addressKeys: KeyRing,
): Promise<{ encrypted: Uint8Array; encSignature: string }> {
  const proxy = await crypto();
  const { message } = await proxy.encryptMessage({
    binaryData: data,
    sessionKey,
    format: "binary",
  });
  const encrypted =
    message instanceof Uint8Array ? message : base64ToBytes(String(message));

  const { signature } = await proxy.signMessage({
    binaryData: data,
    signingKeys: addressKeys,
    detached: true,
    format: "binary",
  });
  const sigBytes =
    signature instanceof Uint8Array ? signature : base64ToBytes(String(signature));
  const { message: encSig } = await proxy.encryptMessage({
    binaryData: sigBytes,
    encryptionKeys: nodeKeys,
    format: "armored",
  });
  return { encrypted, encSignature: String(encSig) };
}

export async function decryptBlock(
  encrypted: Uint8Array,
  sessionKey: SessionKeyMaterial,
): Promise<Uint8Array> {
  const proxy = await crypto();
  const { data } = await proxy.decryptMessage({
    binaryMessage: encrypted,
    sessionKeys: [sessionKey],
    format: "binary",
  });
  return data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
}

export async function decryptFileSessionKey(
  contentKeyPacketBase64: string,
  nodeKeys: KeyRing,
): Promise<SessionKeyMaterial> {
  const proxy = await crypto();
  return proxy.decryptSessionKey({
    binaryMessage: base64ToBytes(contentKeyPacketBase64),
    decryptionKeys: nodeKeys,
  });
}

export function xorVerifier(verCode: Uint8Array, enc: Uint8Array): string {
  const out = new Uint8Array(verCode.length);
  for (let i = 0; i < verCode.length; i++) {
    out[i] = i < enc.length ? (verCode[i]! ^ enc[i]!) : verCode[i]!;
  }
  return bytesToBase64(out);
}

export function buildRevisionManifest(
  rawHashesByIndex: Map<number, Uint8Array>,
): Uint8Array {
  const indices = [...rawHashesByIndex.keys()].sort((a, b) => a - b);
  let total = 0;
  for (const idx of indices) total += rawHashesByIndex.get(idx)!.length;
  const manifest = new Uint8Array(total);
  let offset = 0;
  for (const idx of indices) {
    const hash = rawHashesByIndex.get(idx)!;
    manifest.set(hash, offset);
    offset += hash.length;
  }
  return manifest;
}

export async function signManifest(
  manifest: Uint8Array,
  signingKeys: KeyRing,
): Promise<string> {
  const proxy = await crypto();
  const { signature } = await proxy.signMessage({
    binaryData: manifest,
    signingKeys,
    detached: true,
    format: "armored",
  });
  return String(signature);
}

export async function reEncryptName(
  plainName: string,
  newParentKeys: KeyRing,
  addressKeys: KeyRing,
): Promise<string> {
  return encryptName(plainName, newParentKeys, addressKeys);
}

export async function reEncryptNodePassphrase(
  link: DriveLink,
  oldParentKeys: KeyRing,
  newParentKeys: KeyRing,
  addressKeys: KeyRing,
): Promise<{ passphrase: string; signature: string }> {
  const proxy = await crypto();
  const { data: passphraseBytes } = await proxy.decryptMessage({
    armoredMessage: link.NodePassphrase,
    decryptionKeys: oldParentKeys,
    format: "binary",
  });
  const passphraseStr =
    passphraseBytes instanceof Uint8Array
      ? bytesToBinaryPassphrase(passphraseBytes)
      : String(passphraseBytes);

  const { message: nodePassphraseArmored } = await proxy.encryptMessage({
    textData: passphraseStr,
    encryptionKeys: newParentKeys,
    format: "armored",
  });
  const { signature } = await proxy.signMessage({
    textData: passphraseStr,
    signingKeys: addressKeys,
    detached: true,
    format: "armored",
  });
  return {
    passphrase: String(nodePassphraseArmored),
    signature: String(signature),
  };
}

export { sha256Base64 };
