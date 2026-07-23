import {
  base64ToBytes,
  bytesToBase64,
  computeKeyPassword,
  getCryptoProxy,
} from "../crypto/proxy.ts";
import { CliError, messageForApiCode } from "../util/errors.ts";
import { KEYS_SALTS_PATH, USERS_PATH } from "./constants.ts";
import { protonFetch } from "./http.ts";
import {
  isSuccessCode,
  type KeySalt,
  type KeySaltsResponse,
  type ProtonUser,
  type ProtonUserKey,
  type Session,
  type UsersResponse,
} from "./types.ts";

export interface DecryptedUserKey {
  ID: string;
  privateKey: unknown;
  publicKey: unknown;
}

export async function fetchUser(session: Session): Promise<ProtonUser> {
  const { status, data } = await protonFetch<UsersResponse>(USERS_PATH, {
    session,
  });
  if (status !== 200 || !isSuccessCode(data.Code) || !data.User) {
    throw new CliError(
      messageForApiCode(data.Code, data.Error ?? `Failed to fetch user (HTTP ${status}).`),
    );
  }
  return data.User;
}

export async function fetchKeySalts(session: Session): Promise<KeySalt[]> {
  const { status, data } = await protonFetch<KeySaltsResponse>(KEYS_SALTS_PATH, {
    session,
  });
  if (status !== 200 || !isSuccessCode(data.Code) || !data.KeySalts) {
    throw new CliError(
      messageForApiCode(
        data.Code,
        data.Error ?? `Failed to fetch key salts (HTTP ${status}).`,
      ),
    );
  }
  return data.KeySalts;
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
export async function decryptUserKeys(
  user: ProtonUser,
  password: string,
  salts: KeySalt[],
): Promise<DecryptedUserKey[]> {
  if (user.OrganizationPrivateKey) {
    throw new CliError(
      "Organization-managed keys are not supported.",
    );
  }

  const keys = user.Keys ?? [];
  if (keys.length === 0) {
    throw new CliError("Account has no User Keys.");
  }

  const [primary, ...rest] = keys;
  if (!primary) {
    throw new CliError("Account has no primary User Key.");
  }

  const primaryPassphrase = await passphraseForKey(password, primary.ID, salts);
  const primaryDecrypted = await decryptOneUserKey(primary, primaryPassphrase);
  if (!primaryDecrypted) {
    throw new CliError(
      "Could not unlock User Keys. Check the password (Single Password Mode required).",
    );
  }

  const restDecrypted = await Promise.all(
    rest.map(async (key) => {
      const passphrase = await passphraseForKey(password, key.ID, salts);
      return decryptOneUserKey(key, passphrase);
    }),
  );

  return [primaryDecrypted, ...restDecrypted.filter((k): k is DecryptedUserKey => k !== null)];
}

export async function encryptAuthenticatorKeyBlob(
  keyBytes: Uint8Array,
  userKey: DecryptedUserKey,
): Promise<string> {
  const crypto = await getCryptoProxy();
  const { message } = await crypto.encryptMessage({
    binaryData: keyBytes,
    encryptionKeys: [userKey.publicKey],
    signingKeys: [userKey.privateKey],
    format: "binary",
  });
  return bytesToBase64(message);
}

export async function decryptAuthenticatorKeyBlob(
  blobBase64: string,
  userKey: DecryptedUserKey,
): Promise<Uint8Array> {
  const crypto = await getCryptoProxy();
  const { data } = await crypto.decryptMessage({
    binaryMessage: base64ToBytes(blobBase64),
    decryptionKeys: [userKey.privateKey],
    verificationKeys: [userKey.publicKey],
    format: "binary",
    expectSigned: true,
  });
  return data;
}
