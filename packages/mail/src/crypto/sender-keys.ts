import { getCryptoProxy } from "./proxy.ts";
import { KEYS_ALL_PATH } from "../proton/constants.ts";
import { protonFetch } from "../proton/http.ts";
import { isSuccessCode, type Session } from "../proton/types.ts";
import { CliError } from "../util/errors.ts";

/** KeyStateActive bit from Proton public-key Flags. */
const KEY_FLAG_ACTIVE = 2;

const publicKeyCache = new Map<string, unknown[]>();

export interface FetchSenderPublicKeysOptions {
  session?: Session | null;
  fetchImpl?: typeof fetch;
  /** Bypass cache (tests). */
  forceRefresh?: boolean;
}

interface AddressKeyEntry {
  PublicKey?: string;
  Flags?: number;
  Primary?: number;
}

interface KeysAllResponse {
  Code: number;
  Error?: string;
  RecipientType?: number;
  Address?: {
    Keys?: AddressKeyEntry[];
  };
}

function cacheKey(email: string): string {
  return email.trim().toLowerCase();
}

/** Clear in-memory sender public-key cache (tests). */
export function clearSenderKeyCache(): void {
  publicKeyCache.clear();
}

function isActiveKey(entry: AddressKeyEntry): boolean {
  if (entry.Flags === undefined) return true;
  return (entry.Flags & KEY_FLAG_ACTIVE) !== 0;
}

/**
 * Fetch + cache public keys for an email via GET /core/v4/keys/all.
 *
 * Fail-closed: network / API / total-import failures throw (not cached as []).
 * Authoritative empty key lists (successful response, no usable keys) return []
 * and are cached — callers may treat that as external/cleartext.
 */
export async function fetchSenderPublicKeys(
  email: string,
  options: FetchSenderPublicKeysOptions = {},
): Promise<unknown[]> {
  const key = cacheKey(email);
  if (!key) return [];

  if (!options.forceRefresh) {
    const cached = publicKeyCache.get(key);
    if (cached) return cached;
  }

  let status: number;
  let data: KeysAllResponse;
  try {
    const path = `${KEYS_ALL_PATH}?Email=${encodeURIComponent(email.trim())}`;
    const result = await protonFetch<KeysAllResponse>(path, {
      session: options.session ?? null,
      fetchImpl: options.fetchImpl,
    });
    status = result.status;
    data = result.data;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CliError(
      `Public-key lookup failed for ${email.trim()}: ${detail}`,
    );
  }

  if (status !== 200 || !isSuccessCode(data.Code)) {
    throw new CliError(
      data.Error ??
        `Public-key lookup failed for ${email.trim()} (HTTP ${status}, code ${data.Code}).`,
    );
  }

  const rawKeys = data.Address?.Keys ?? [];
  const entries = rawKeys.filter(
    (entry) => Boolean(entry.PublicKey) && isActiveKey(entry),
  );
  const armored = entries
    .map((entry) => entry.PublicKey)
    .filter((value): value is string => Boolean(value));

  if (armored.length === 0) {
    if (rawKeys.some((entry) => Boolean(entry.PublicKey))) {
      // Keys present but none active/usable — fail closed, do not cleartext.
      throw new CliError(
        `No active public keys available for ${email.trim()}.`,
      );
    }
    // Authoritative empty — external / no Proton keys.
    publicKeyCache.set(key, []);
    return [];
  }

  const CryptoProxy = await getCryptoProxy();
  const imported: unknown[] = [];
  const importErrors: string[] = [];
  for (const publicKey of armored) {
    try {
      imported.push(
        await CryptoProxy.importPublicKey({ armoredKey: publicKey }),
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      importErrors.push(detail);
    }
  }

  if (imported.length === 0) {
    throw new CliError(
      `Could not import any public keys for ${email.trim()}` +
        (importErrors[0] ? `: ${importErrors[0]}` : "."),
    );
  }

  publicKeyCache.set(key, imported);
  return imported;
}
