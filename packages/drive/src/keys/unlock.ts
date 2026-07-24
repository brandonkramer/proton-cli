import {
  getDriveCrypto,
  type CryptoKey,
} from "../drive/crypto/proxy.ts";
import {
  unlockUserKeys,
  type DecryptedUserKey,
  type KeySalt,
  type ProtonUser,
} from "@bkramer/proton-core";
import { CliError } from "../util/errors.ts";
import { ADDRESSES_PATH, KEYS_SALTS_PATH, USERS_PATH } from "../proton/constants.ts";
import { protonFetch } from "../proton/http.ts";
import {
  isSuccessCode,
  type Session,
} from "../proton/types.ts";

export type { CryptoKey };

export interface AddressRecord {
  ID: string;
  Email: string;
  Keys: AddressKeyRecord[];
}

export interface AddressKeyRecord {
  ID: string;
  PrivateKey: string;
  Token?: string | null;
  Signature?: string | null;
  Primary?: number;
  Active?: number;
}

export interface UnlockedKeys {
  userKeys: DecryptedUserKey[];
  addressKeys: Map<string, CryptoKey[]>;
  addresses: AddressRecord[];
}

interface UsersResponse {
  Code: number;
  User?: ProtonUser;
  Error?: string;
}

interface KeySaltsResponse {
  Code: number;
  KeySalts?: KeySalt[];
  Error?: string;
}

interface AddressesResponse {
  Code: number;
  Addresses?: AddressRecord[];
  Error?: string;
}

async function fetchUser(
  session: Session,
  fetchImpl?: typeof fetch,
): Promise<ProtonUser> {
  const { status, data } = await protonFetch<UsersResponse>(USERS_PATH, {
    session,
    fetchImpl,
  });
  if (status !== 200 || !isSuccessCode(data.Code) || !data.User) {
    throw new CliError(
      data.Error ?? `Failed to fetch user (HTTP ${status}).`,
    );
  }
  return data.User;
}

async function fetchKeySalts(
  session: Session,
  fetchImpl?: typeof fetch,
): Promise<KeySalt[]> {
  const { status, data } = await protonFetch<KeySaltsResponse>(KEYS_SALTS_PATH, {
    session,
    fetchImpl,
  });
  if (status !== 200 || !isSuccessCode(data.Code) || !data.KeySalts) {
    throw new CliError(
      data.Error ?? `Failed to fetch key salts (HTTP ${status}).`,
    );
  }
  return data.KeySalts;
}

async function fetchAddresses(
  session: Session,
  fetchImpl?: typeof fetch,
): Promise<AddressRecord[]> {
  const { status, data } = await protonFetch<AddressesResponse>(
    ADDRESSES_PATH,
    { session, fetchImpl },
  );
  if (status !== 200 || !isSuccessCode(data.Code) || !data.Addresses) {
    throw new CliError(
      data.Error ?? `Failed to fetch addresses (HTTP ${status}).`,
    );
  }
  return data.Addresses;
}

async function decryptToken(
  tokenArmored: string,
  signatureArmored: string,
  userKeys: DecryptedUserKey[],
): Promise<Uint8Array> {
  const crypto = await getDriveCrypto();
  const primary = userKeys[0];
  if (!primary) {
    throw new CliError("No unlocked User Key for address token decryption.");
  }

  // Address-key Token is encrypted to the user key; Signature is a detached
  // signature over the cleartext token (not an inline signed ciphertext).
  const { data } = await crypto.decryptMessage({
    armoredMessage: tokenArmored,
    decryptionKeys: [primary.privateKey],
    verificationKeys: [primary.publicKey],
    armoredSignature: signatureArmored,
    format: "binary",
    expectSigned: true,
  });

  return data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
}

function bytesToPassphrase(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

async function unlockAddressKeyRing(
  keys: AddressKeyRecord[],
  accountPassword: Uint8Array | string,
  userKeys: DecryptedUserKey[],
): Promise<CryptoKey[]> {
  const crypto = await getDriveCrypto();
  const unlocked: CryptoKey[] = [];
  const passphrase =
    typeof accountPassword === "string"
      ? accountPassword
      : new TextDecoder().decode(accountPassword);

  for (const key of keys) {
    if (key.Active === 0) continue;

    let secret: string = passphrase;
    if (key.Token && key.Signature) {
      try {
        secret = bytesToPassphrase(
          await decryptToken(key.Token, key.Signature, userKeys),
        );
      } catch {
        continue;
      }
    }

    try {
      const privateKey = await crypto.importPrivateKey({
        armoredKey: key.PrivateKey,
        passphrase: secret,
      });
      unlocked.push(privateKey);
    } catch {
      // try next key
    }
  }

  return unlocked;
}

export async function unlockDriveKeys(
  session: Session,
  password: string,
  fetchImpl?: typeof fetch,
): Promise<UnlockedKeys> {
  const user = await fetchUser(session, fetchImpl);
  const [salts, addresses] = await Promise.all([
    fetchKeySalts(session, fetchImpl),
    fetchAddresses(session, fetchImpl),
  ]);

  const userKeys = await unlockUserKeys(user, password, salts);
  const addressKeys = new Map<string, CryptoKey[]>();

  for (const address of addresses) {
    const ring = await unlockAddressKeyRing(
      address.Keys ?? [],
      password,
      userKeys,
    );
    if (ring.length > 0) {
      addressKeys.set(address.ID, ring);
    }
  }

  if (addressKeys.size === 0) {
    throw new CliError("Failed to unlock any address keys.");
  }

  return { userKeys, addressKeys, addresses };
}

export function primaryAddress(
  unlocked: UnlockedKeys,
): { addressId: string; email: string; keys: CryptoKey[] } {
  for (const address of unlocked.addresses) {
    const keys = unlocked.addressKeys.get(address.ID);
    if (!keys?.length) continue;
    const email = address.Email.toLowerCase();
    if (
      email.endsWith("@proton.me") ||
      email.endsWith("@pm.me") ||
      email.endsWith("@protonmail.com")
    ) {
      return { addressId: address.ID, email: address.Email, keys };
    }
  }

  for (const address of unlocked.addresses) {
    const keys = unlocked.addressKeys.get(address.ID);
    if (keys?.length) {
      return { addressId: address.ID, email: address.Email, keys };
    }
  }

  throw new CliError("No address key ring available.");
}

export function addressKeysForId(
  unlocked: UnlockedKeys,
  addressId: string,
): CryptoKey[] {
  const keys = unlocked.addressKeys.get(addressId);
  if (!keys?.length) {
    throw new CliError(`No key ring for address ${addressId}.`);
  }
  return keys;
}
