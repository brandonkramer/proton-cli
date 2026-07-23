export interface AuthInfoResponse {
  Code: number;
  Version: number;
  Modulus: string;
  ServerEphemeral: string;
  Salt: string;
  SRPSession: string;
  "2FA"?: {
    Enabled: number;
    TOTP: number;
  };
  Error?: string;
}

export interface Session {
  Code: number;
  AccessToken: string;
  RefreshToken: string;
  TokenType: string;
  Scopes: string[];
  UID: string;
  UserID: string;
  EventID?: string;
  ServerProof?: string;
  PasswordMode?: number;
  ExpiresIn: number;
  Error?: string;
  "2FA"?: {
    Enabled: number;
    TOTP: number;
  };
}

export interface SavedSession {
  session: Session;
  username: string;
  savedAt: string;
  expiresAt: string;
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

export interface UsersResponse {
  Code: number;
  User: ProtonUser;
  Error?: string;
}

/** Per-key bcrypt salt for deriving the User Key passphrase. */
export interface KeySalt {
  ID: string;
  KeySalt: string | null;
}

export interface KeySaltsResponse {
  Code: number;
  KeySalts: KeySalt[];
  Error?: string;
}

export interface AuthenticatorKeyResponse {
  Key: string;
  KeyID: string;
  UserKeyID: string;
}

export interface AuthenticatorKeysPayload {
  Keys: AuthenticatorKeyResponse[];
}

export interface AuthenticatorKeysApiResponse {
  Code: number;
  Keys: AuthenticatorKeysPayload | AuthenticatorKeyResponse[];
  Error?: string;
}

export interface AuthenticatorKeyCreateResponse {
  Code: number;
  Key: AuthenticatorKeyResponse;
  Error?: string;
}

export interface AuthenticatorEntryResponse {
  EntryID: string;
  AuthenticatorKeyID: string;
  Revision: number;
  ContentFormatVersion: number;
  Content: string;
  Flags: number;
  CreateTime: number;
  ModifyTime: number;
}

export interface AuthenticatorEntriesPayload {
  Entries: AuthenticatorEntryResponse[];
  Total: number;
  LastID?: string | null;
}

export interface AuthenticatorEntriesApiResponse {
  Code: number;
  Entries: AuthenticatorEntriesPayload | AuthenticatorEntryResponse[];
  Error?: string;
}

export type SyncState = "Synced" | "PendingSync" | "PendingToDelete";
export type EntryType = "Totp" | "Steam";

/** Persisted entry: ciphertext + public metadata only (no secrets). */
export interface LocalEntry {
  entryId: string;
  localId: string;
  authenticatorKeyId: string;
  revision: number;
  contentFormatVersion: number;
  /** Base64 AES-GCM ciphertext */
  content: string;
  flags: number;
  createTime: number;
  modifyTime: number;
  issuer: string;
  name: string;
  period: number;
  entryType: EntryType;
  syncState: SyncState;
}

export interface LocalEntriesStore {
  entries: LocalEntry[];
  lastSyncAt: string | null;
  authenticatorKeyId: string | null;
}

export interface EncryptionKey {
  id: string;
  userKeyId: string;
  keyBytes: Uint8Array;
}

export const API_CODE_OK = 1000;
export const API_CODE_MULTI = 1001;
export const API_CODE_PASSWORD_WRONG = 8002;
export const API_CODE_HUMAN_VERIFICATION = 9001;
export const API_CODE_APP_VERSION_BAD = 5003;
export const API_CODE_MAILBOX_PASSWORD = 10013;
export const API_CODE_SCOPE = 9100;

export function isSuccessCode(code: number): boolean {
  return code === API_CODE_OK || code === API_CODE_MULTI;
}
