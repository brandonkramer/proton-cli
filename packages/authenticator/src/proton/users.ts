import {
  getCryptoProxy,
  unlockUserKeys,
  type DecryptedUserKey,
  type KeySalt,
  type ProtonUser,
  type ProtonUserKey,
} from "@bkramer/proton-core";
import { base64ToBytes, bytesToBase64 } from "../crypto/proxy.ts";
import { CliError, messageForApiCode } from "../util/errors.ts";
import { KEYS_SALTS_PATH, USERS_PATH } from "./constants.ts";
import { protonFetch } from "./http.ts";
import {
  isSuccessCode,
  type KeySaltsResponse,
  type Session,
  type UsersResponse,
} from "./types.ts";

export type { DecryptedUserKey, KeySalt, ProtonUser, ProtonUserKey };

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

function toCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof Error) return new CliError(error.message);
  return new CliError(String(error));
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
  try {
    return await unlockUserKeys(user, password, salts);
  } catch (error) {
    throw toCliError(error);
  }
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

export { computeKeyPassword } from "@bkramer/proton-core";
