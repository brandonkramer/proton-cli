import { CliError, messageForApiCode } from "../util/errors.ts";
import {
  AUTHENTICATOR_ENTRY_BULK_PATH,
  AUTHENTICATOR_ENTRY_PATH,
  AUTHENTICATOR_KEY_PATH,
  CONTENT_FORMAT_VERSION,
} from "./constants.ts";
import { protonFetch } from "./http.ts";
import {
  isSuccessCode,
  type AuthenticatorEntryResponse,
  type AuthenticatorEntriesApiResponse,
  type AuthenticatorKeyCreateResponse,
  type AuthenticatorKeyResponse,
  type AuthenticatorKeysApiResponse,
  type Session,
} from "./types.ts";

function unwrapKeys(
  payload: AuthenticatorKeysApiResponse["Keys"],
): AuthenticatorKeyResponse[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.Keys)) return payload.Keys;
  return [];
}

function unwrapEntriesPage(data: AuthenticatorEntriesApiResponse): {
  entries: AuthenticatorEntryResponse[];
  lastId: string | null;
} {
  const payload = data.Entries;
  if (Array.isArray(payload)) {
    return { entries: payload, lastId: null };
  }
  if (payload && Array.isArray(payload.Entries)) {
    return {
      entries: payload.Entries,
      lastId: payload.LastID ?? null,
    };
  }
  return { entries: [], lastId: null };
}

export async function listAuthenticatorKeys(
  session: Session,
): Promise<AuthenticatorKeyResponse[]> {
  const { status, data } = await protonFetch<AuthenticatorKeysApiResponse>(
    AUTHENTICATOR_KEY_PATH,
    { session },
  );
  if (status !== 200 || !isSuccessCode(data.Code)) {
    throw new CliError(
      messageForApiCode(
        data.Code,
        data.Error ?? `Failed to list Authenticator Keys (HTTP ${status}).`,
      ),
    );
  }
  return unwrapKeys(data.Keys);
}

export async function storeAuthenticatorKey(
  session: Session,
  encryptedKeyBase64: string,
): Promise<AuthenticatorKeyResponse> {
  const { status, data } = await protonFetch<AuthenticatorKeyCreateResponse>(
    AUTHENTICATOR_KEY_PATH,
    {
      method: "POST",
      session,
      body: { Key: encryptedKeyBase64 },
    },
  );
  if (status !== 200 || !isSuccessCode(data.Code) || !data.Key) {
    throw new CliError(
      messageForApiCode(
        data.Code,
        data.Error ?? `Failed to store Authenticator Key (HTTP ${status}).`,
      ),
    );
  }
  return data.Key;
}

export async function fetchAllEntries(
  session: Session,
): Promise<AuthenticatorEntryResponse[]> {
  const all: AuthenticatorEntryResponse[] = [];
  let since: string | undefined;

  for (;;) {
    const { status, data } = await protonFetch<AuthenticatorEntriesApiResponse>(
      AUTHENTICATOR_ENTRY_PATH,
      {
        session,
        query: { Since: since },
      },
    );

    if (status !== 200 || !isSuccessCode(data.Code)) {
      throw new CliError(
        messageForApiCode(
          data.Code,
          data.Error ?? `Failed to list entries (HTTP ${status}).`,
        ),
      );
    }

    const { entries, lastId } = unwrapEntriesPage(data);
    all.push(...entries);

    if (!lastId || entries.length === 0) break;
    since = lastId;
  }

  return all;
}

export async function createEntriesBulk(
  session: Session,
  keyId: string,
  encryptedContents: Uint8Array[],
): Promise<AuthenticatorEntryResponse[]> {
  const { status, data } = await protonFetch<{
    Code: number;
    Entries?: AuthenticatorEntryResponse[];
    Error?: string;
  }>(AUTHENTICATOR_ENTRY_BULK_PATH, {
    method: "POST",
    session,
    body: {
      Entries: encryptedContents.map((content) => ({
        AuthenticatorKeyID: keyId,
        Content: Buffer.from(content).toString("base64"),
        ContentFormatVersion: CONTENT_FORMAT_VERSION,
      })),
    },
  });

  if (status !== 200 || !isSuccessCode(data.Code)) {
    throw new CliError(
      messageForApiCode(
        data.Code,
        data.Error ?? `Failed to create entries (HTTP ${status}).`,
      ),
    );
  }
  return data.Entries ?? [];
}

export async function deleteEntriesBulk(
  session: Session,
  entryIds: string[],
): Promise<void> {
  if (entryIds.length === 0) return;
  const { status, data } = await protonFetch<{ Code: number; Error?: string }>(
    AUTHENTICATOR_ENTRY_BULK_PATH,
    {
      method: "DELETE",
      session,
      body: { EntryIDs: entryIds },
    },
  );
  if (status !== 200 || !isSuccessCode(data.Code)) {
    throw new CliError(
      messageForApiCode(
        data.Code,
        data.Error ?? `Failed to delete entries (HTTP ${status}).`,
      ),
    );
  }
}
