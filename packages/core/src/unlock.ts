import { getCryptoProxy } from "./crypto.ts";

/** Per-key bcrypt salt for deriving the User Key passphrase. */
export interface KeySalt {
  ID: string;
  KeySalt: string | null;
}

export interface ProtonUserKey {
  ID: string;
  Version: number;
  PrivateKey: string;
  Fingerprint?: string;
  Primary?: number;
  Active?: number;
  Token?: string | null;
}

export interface ProtonUser {
  ID: string;
  Name: string;
  Keys: ProtonUserKey[];
  OrganizationPrivateKey?: string | null;
}

export interface DecryptedUserKey {
  ID: string;
  privateKey: unknown;
  publicKey: unknown;
}

type ComputeKeyPasswordFn = (password: string, salt: string) => Promise<string>;

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
    computeKeyPassword: ComputeKeyPasswordFn;
  };
  return mod.computeKeyPassword(password, salt);
}

async function passphraseForKey(
  password: string,
  keyId: string,
  salts: KeySalt[],
): Promise<string> {
  const salt = salts.find((entry) => entry.ID === keyId)?.KeySalt;
  // Empty/missing salt: legacy keys encrypted with the raw password.
  if (!salt) return password;
  return computeKeyPassword(password, salt);
}

async function decryptOneUserKey(
  key: ProtonUserKey,
  passphrase: string,
): Promise<DecryptedUserKey | null> {
  try {
    const crypto = await getCryptoProxy();
    const privateKey = await crypto.importPrivateKey({
      armoredKey: key.PrivateKey,
      passphrase,
    });
    const publicKey = await crypto.importPublicKey({
      armoredKey: key.PrivateKey,
    });
    return { ID: key.ID, privateKey, publicKey };
  } catch {
    return null;
  }
}

/**
 * Unlock User Keys with the account password (Single Password Mode).
 * Passphrase is bcrypt(password, KeySalt) from `/core/v4/keys/salts`.
 * Returns keys in API order (primary first).
 */
export async function unlockUserKeys(
  user: ProtonUser,
  password: string,
  keySalts: KeySalt[],
): Promise<DecryptedUserKey[]> {
  if (user.OrganizationPrivateKey) {
    throw new Error("Organization-managed keys are not supported.");
  }

  const keys = user.Keys ?? [];
  if (keys.length === 0) {
    throw new Error("Account has no User Keys.");
  }

  const [primary, ...rest] = keys;
  if (!primary) {
    throw new Error("Account has no primary User Key.");
  }

  const primaryPassphrase = await passphraseForKey(password, primary.ID, keySalts);
  const primaryDecrypted = await decryptOneUserKey(primary, primaryPassphrase);
  if (!primaryDecrypted) {
    throw new Error(
      "Could not unlock User Keys. Check the password (Single Password Mode required).",
    );
  }

  const restDecrypted = await Promise.all(
    rest.map(async (key) => {
      const passphrase = await passphraseForKey(password, key.ID, keySalts);
      return decryptOneUserKey(key, passphrase);
    }),
  );

  return [
    primaryDecrypted,
    ...restDecrypted.filter((k): k is DecryptedUserKey => k !== null),
  ];
}

export interface UnlockUserKeysWithFetchOptions {
  password: string;
  fetchUser: () => Promise<ProtonUser>;
  fetchKeySalts: () => Promise<KeySalt[]>;
}

/** Fetch user + key salts, then unlock User Keys. */
export async function unlockUserKeysWithFetch(
  options: UnlockUserKeysWithFetchOptions,
): Promise<DecryptedUserKey[]> {
  const [user, keySalts] = await Promise.all([
    options.fetchUser(),
    options.fetchKeySalts(),
  ]);
  return unlockUserKeys(user, options.password, keySalts);
}
