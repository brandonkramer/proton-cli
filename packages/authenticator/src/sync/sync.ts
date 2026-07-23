import { loadLocalEntries, saveLocalEntries } from "../config/store.ts";
import { base64ToBytes } from "../crypto/proxy.ts";
import {
  deleteEntriesBulk,
  fetchAllEntries,
} from "../proton/authenticator-api.ts";
import { requireSession } from "../proton/auth.ts";
import {
  ensureAuthenticatorKey,
  findEncryptionKey,
  loadEncryptionKeys,
} from "../proton/keys.ts";
import type {
  AuthenticatorEntryResponse,
  EncryptionKey,
  LocalEntry,
  LocalEntriesStore,
  Session,
} from "../proton/types.ts";
import {
  decryptUserKeys,
  fetchKeySalts,
  fetchUser,
  type DecryptedUserKey,
} from "../proton/users.ts";
import { decryptEntries, type AuthenticatorEntryModel } from "../wasm/service.ts";
import { CliError } from "../util/errors.ts";

export interface UnlockContext {
  session: Session;
  username: string;
  userKeys: DecryptedUserKey[];
  encryptionKeys: EncryptionKey[];
  primaryKey: EncryptionKey;
}

export async function unlockWithPassword(
  password: string,
): Promise<UnlockContext> {
  const { session, username } = await requireSession();
  const [user, salts] = await Promise.all([
    fetchUser(session),
    fetchKeySalts(session),
  ]);
  const userKeys = await decryptUserKeys(user, password, salts);
  const encryptionKeys = await loadEncryptionKeys(session, userKeys);
  const primaryKey = await ensureAuthenticatorKey(session, userKeys);
  // ensureAuthenticatorKey may create; merge into list
  if (!encryptionKeys.some((k) => k.id === primaryKey.id)) {
    encryptionKeys.unshift(primaryKey);
  }
  return { session, username, userKeys, encryptionKeys, primaryKey };
}

async function parseRemoteEntry(
  remote: AuthenticatorEntryResponse,
  keys: EncryptionKey[],
): Promise<LocalEntry | null> {
  const key = findEncryptionKey(keys, remote.AuthenticatorKeyID);
  if (!key) return null;

  try {
    const content = base64ToBytes(remote.Content);
    const [model] = await decryptEntries([content], key.keyBytes);
    if (!model) return null;

    return {
      entryId: remote.EntryID,
      localId: model.id,
      authenticatorKeyId: remote.AuthenticatorKeyID,
      revision: remote.Revision,
      contentFormatVersion: remote.ContentFormatVersion,
      content: remote.Content,
      flags: remote.Flags,
      createTime: remote.CreateTime,
      modifyTime: remote.ModifyTime,
      issuer: model.issuer || "",
      name: model.name || "",
      period: model.period || 30,
      entryType: model.entry_type === "Steam" ? "Steam" : "Totp",
      syncState: "Synced",
    };
  } catch {
    return null;
  }
}

export async function decryptLocalEntry(
  entry: LocalEntry,
  keys: EncryptionKey[],
): Promise<AuthenticatorEntryModel> {
  const key = findEncryptionKey(keys, entry.authenticatorKeyId);
  if (!key) {
    throw new CliError(
      `Missing Authenticator Key for entry "${entry.issuer || entry.name}".`,
    );
  }
  const [model] = await decryptEntries(
    [base64ToBytes(entry.content)],
    key.keyBytes,
  );
  if (!model) {
    throw new CliError(
      `Failed to decrypt entry "${entry.issuer || entry.name}".`,
    );
  }
  return model;
}

export interface SyncResult {
  pulled: number;
  /** Entries returned by the API before decrypt/filter. */
  remoteTotal: number;
  /** Remote entries skipped (missing key or decrypt failure). */
  skipped: number;
  deletedRemote: number;
  store: LocalEntriesStore;
}

/**
 * Pull remote entries, merge into local store (ciphertext + public metadata).
 * Push PendingToDelete deletions. Creating remote entries is not implemented yet.
 */
export async function syncEntries(password: string): Promise<SyncResult> {
  const ctx = await unlockWithPassword(password);
  const local = await loadLocalEntries();

  const pendingDelete = local.entries.filter(
    (e) => e.syncState === "PendingToDelete" && e.entryId,
  );
  if (pendingDelete.length > 0) {
    await deleteEntriesBulk(
      ctx.session,
      pendingDelete.map((e) => e.entryId),
    );
  }

  const remote = await fetchAllEntries(ctx.session);
  const parsed = (
    await Promise.all(
      remote.map((entry) => parseRemoteEntry(entry, ctx.encryptionKeys)),
    )
  ).filter((entry): entry is LocalEntry => entry !== null);

  const skipped = remote.length - parsed.length;

  // Preserve local-only PendingSync items that have no remote id yet.
  const pendingLocal = local.entries.filter(
    (e) => e.syncState === "PendingSync" && !e.entryId,
  );

  const store: LocalEntriesStore = {
    entries: [...parsed, ...pendingLocal],
    lastSyncAt: new Date().toISOString(),
    authenticatorKeyId: ctx.primaryKey.id,
  };

  await saveLocalEntries(store);

  return {
    pulled: parsed.length,
    remoteTotal: remote.length,
    skipped,
    deletedRemote: pendingDelete.length,
    store,
  };
}

export function formatSyncSummary(result: SyncResult): string {
  if (result.remoteTotal === 0) {
    return (
      "Remote vault is empty (0 entries).\n" +
      "In Proton Authenticator, enable Sync and wait for codes to upload."
    );
  }
  const parts = [`Pulled ${result.pulled} of ${result.remoteTotal} remote`];
  if (result.skipped > 0) {
    parts.push(`${result.skipped} skipped (could not decrypt)`);
  }
  if (result.deletedRemote > 0) {
    parts.push(`deleted ${result.deletedRemote} remote`);
  }
  return parts.join(" · ");
}

export async function ensureKeyOnSignin(password: string): Promise<{
  keyId: string;
  username: string;
}> {
  const ctx = await unlockWithPassword(password);
  return { keyId: ctx.primaryKey.id, username: ctx.username };
}
