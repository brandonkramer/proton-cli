import {
  computeKeyPassword,
  unlockUserKeysWithFetch,
  type DecryptedUserKey,
} from "@bkramer/proton-core";
import { getCryptoProxy } from "./proxy.ts";
import {
  ADDRESSES_PATH,
  KEYS_SALTS_PATH,
  USERS_PATH,
} from "../proton/constants.ts";
import { mailApi } from "../proton/api.ts";
import type { Session } from "../proton/types.ts";

export interface AddressKey {
  ID: string;
  PrivateKey: string;
  Token?: string | null;
  Signature?: string | null;
  Primary?: number;
  Active?: number;
}

export interface ProtonAddress {
  ID: string;
  Email: string;
  Keys: AddressKey[];
  /** 1 = enabled (when present). */
  Status?: number;
  /** Lower is higher priority (when present). */
  Order?: number;
}

export interface UnlockedAddressKey {
  addressId: string;
  email: string;
  privateKey: unknown;
  publicKey: unknown;
}

export interface UnlockedMailKeys {
  userKeys: DecryptedUserKey[];
  addresses: ProtonAddress[];
  addressKeys: Map<string, UnlockedAddressKey>;
}

interface UnlockFetchOptions {
  session: Session;
  password: string;
  fetchImpl?: typeof fetch;
}

async function fetchUser(session: Session, fetchImpl?: typeof fetch) {
  const data = await mailApi<{
    User: {
      ID: string;
      Name: string;
      Keys: {
        ID: string;
        Version: number;
        PrivateKey: string;
        Token?: string | null;
        Primary?: number;
        Active?: number;
      }[];
    };
  }>(USERS_PATH, { session, fetchImpl });
  return data.User;
}

async function fetchKeySalts(session: Session, fetchImpl?: typeof fetch) {
  const data = await mailApi<{ KeySalts: { ID: string; KeySalt: string | null }[] }>(
    KEYS_SALTS_PATH,
    { session, fetchImpl },
  );
  return data.KeySalts;
}

async function fetchAddresses(session: Session, fetchImpl?: typeof fetch) {
  const data = await mailApi<{ Addresses: ProtonAddress[] }>(
    ADDRESSES_PATH,
    { session, fetchImpl },
  );
  return data.Addresses;
}

async function passphraseForKey(
  password: string,
  keyId: string,
  salts: { ID: string; KeySalt: string | null }[],
): Promise<string> {
  const salt = salts.find((entry) => entry.ID === keyId)?.KeySalt;
  if (!salt) return password;
  return computeKeyPassword(password, salt);
}

async function decryptTokenPassphrase(
  tokenArmored: string,
  signatureArmored: string,
  userPrivateKey: unknown,
): Promise<string> {
  const CryptoProxy = await getCryptoProxy();
  const { data } = await CryptoProxy.decryptMessage({
    armoredMessage: tokenArmored,
    armoredSignature: signatureArmored,
    decryptionKeys: [userPrivateKey as never],
    verificationKeys: [userPrivateKey as never],
    format: "utf8",
  } as never);
  return typeof data === "string" ? data : new TextDecoder().decode(data);
}

async function unlockAddressKeyRing(
  keys: AddressKey[],
  basePassphrase: string,
  userPrivateKey: unknown | null,
): Promise<{ privateKey: unknown; publicKey: unknown } | null> {
  const CryptoProxy = await getCryptoProxy();
  for (const key of keys) {
    if (key.Active === 0) continue;
    let secret = basePassphrase;
    if (key.Token && key.Signature && userPrivateKey) {
      try {
        secret = await decryptTokenPassphrase(
          key.Token,
          key.Signature,
          userPrivateKey,
        );
      } catch {
        continue;
      }
    }
    try {
      const privateKey = await CryptoProxy.importPrivateKey({
        armoredKey: key.PrivateKey,
        passphrase: secret,
      });
      const publicKey = await CryptoProxy.importPublicKey({
        armoredKey: key.PrivateKey,
      });
      return { privateKey, publicKey };
    } catch {
      continue;
    }
  }
  return null;
}

/** Unlock user + address keys via shared core CryptoProxy (INV-E2EE-001). */
export async function unlockMailKeys(
  session: Session,
  password: string,
  fetchImpl?: typeof fetch,
): Promise<UnlockedMailKeys> {
  return unlockMailKeysWithOptions({ session, password, fetchImpl });
}

export async function unlockMailKeysWithOptions(
  options: UnlockFetchOptions,
): Promise<UnlockedMailKeys> {
  const userKeys = await unlockUserKeysWithFetch({
    password: options.password,
    fetchUser: () => fetchUser(options.session, options.fetchImpl),
    fetchKeySalts: () => fetchKeySalts(options.session, options.fetchImpl),
  });

  const primaryUserKey = userKeys[0]?.privateKey ?? null;
  const addresses = await fetchAddresses(options.session, options.fetchImpl);
  const salts = await fetchKeySalts(options.session, options.fetchImpl);

  const addressKeys = new Map<string, UnlockedAddressKey>();
  for (const address of addresses) {
    const primaryKey = address.Keys.find((k) => k.Primary === 1) ?? address.Keys[0];
    const basePass = primaryKey
      ? await passphraseForKey(options.password, primaryKey.ID, salts)
      : options.password;
    const unlocked = await unlockAddressKeyRing(
      address.Keys,
      basePass,
      primaryUserKey,
    );
    if (unlocked) {
      addressKeys.set(address.ID, {
        addressId: address.ID,
        email: address.Email,
        privateKey: unlocked.privateKey,
        publicKey: unlocked.publicKey,
      });
    }
  }

  if (addressKeys.size === 0) {
    throw new Error("Could not unlock any address keys. Check the account password.");
  }

  return { userKeys, addresses, addressKeys };
}

const PRIMARY_SUFFIXES = ["@proton.me", "@pm.me", "@protonmail.com"];

function isEnabledAddress(address: ProtonAddress): boolean {
  return address.Status === undefined || address.Status === 1;
}

/**
 * Prefer enabled @proton.me / @pm.me address (lowest Order), else first
 * unlockable enabled address.
 */
export function primaryAddressKey(
  unlocked: Pick<UnlockedMailKeys, "addresses" | "addressKeys">,
): UnlockedAddressKey {
  const candidates = unlocked.addresses
    .filter((address) => isEnabledAddress(address) && unlocked.addressKeys.has(address.ID))
    .sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0));

  for (const address of candidates) {
    const email = address.Email.toLowerCase();
    if (PRIMARY_SUFFIXES.some((suffix) => email.endsWith(suffix))) {
      const key = unlocked.addressKeys.get(address.ID);
      if (key) return key;
    }
  }

  for (const address of candidates) {
    const key = unlocked.addressKeys.get(address.ID);
    if (key) return key;
  }

  const first = unlocked.addressKeys.values().next().value;
  if (!first) {
    throw new Error("No address key rings available.");
  }
  return first;
}

/** Resolve address key for a message AddressID. */
export function addressKeyForId(
  unlocked: Pick<UnlockedMailKeys, "addressKeys">,
  addressId: string,
): UnlockedAddressKey {
  const key = unlocked.addressKeys.get(addressId);
  if (key) return key;
  const first = unlocked.addressKeys.values().next().value;
  if (!first) {
    throw new Error("No address key rings available.");
  }
  return first;
}
