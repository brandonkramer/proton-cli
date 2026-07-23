import { generateKey } from "../wasm/service.ts";
import { CliError } from "../util/errors.ts";
import {
  listAuthenticatorKeys,
  storeAuthenticatorKey,
} from "./authenticator-api.ts";
import type { DecryptedUserKey } from "./users.ts";
import {
  decryptAuthenticatorKeyBlob,
  encryptAuthenticatorKeyBlob,
} from "./users.ts";
import type { EncryptionKey, Session } from "./types.ts";

async function parseRemoteKey(
  remote: { Key: string; KeyID: string; UserKeyID: string },
  userKeys: DecryptedUserKey[],
): Promise<EncryptionKey | null> {
  const userKey = userKeys.find((k) => k.ID === remote.UserKeyID);
  if (!userKey) return null;
  try {
    const keyBytes = await decryptAuthenticatorKeyBlob(remote.Key, userKey);
    return {
      id: remote.KeyID,
      userKeyId: remote.UserKeyID,
      keyBytes,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch Authenticator Keys, decrypt with User Keys, and create one for the
 * primary User Key if missing. Authenticator Key bytes stay in memory only.
 */
export async function ensureAuthenticatorKey(
  session: Session,
  userKeys: DecryptedUserKey[],
): Promise<EncryptionKey> {
  const primary = userKeys[0];
  if (!primary) {
    throw new CliError("No decrypted User Keys available.");
  }

  const remoteKeys = await listAuthenticatorKeys(session);
  const active = remoteKeys.filter((remote) =>
    userKeys.some((uk) => uk.ID === remote.UserKeyID),
  );

  const parsed = (
    await Promise.all(active.map((remote) => parseRemoteKey(remote, userKeys)))
  ).filter((key): key is EncryptionKey => key !== null);

  const forPrimary = parsed.find((key) => key.userKeyId === primary.ID);
  if (forPrimary) {
    return forPrimary;
  }

  if (userKeys.length <= active.length && parsed.length === 0 && active.length > 0) {
    throw new CliError(
      "Authenticator Keys exist on the server but could not be decrypted.\n" +
        "This can happen after a password reset. Recover keys in the official Authenticator app.",
    );
  }

  const keyBytes = await generateKey();
  const blob = await encryptAuthenticatorKeyBlob(keyBytes, primary);
  const created = await storeAuthenticatorKey(session, blob);
  return {
    id: created.KeyID,
    userKeyId: created.UserKeyID,
    keyBytes,
  };
}

export async function loadEncryptionKeys(
  session: Session,
  userKeys: DecryptedUserKey[],
): Promise<EncryptionKey[]> {
  const remoteKeys = await listAuthenticatorKeys(session);
  const parsed = (
    await Promise.all(
      remoteKeys.map((remote) => parseRemoteKey(remote, userKeys)),
    )
  ).filter((key): key is EncryptionKey => key !== null);

  if (parsed.length === 0) {
    return [await ensureAuthenticatorKey(session, userKeys)];
  }
  return parsed;
}

export function findEncryptionKey(
  keys: EncryptionKey[],
  keyId: string,
): EncryptionKey | undefined {
  return keys.find((key) => key.id === keyId);
}
