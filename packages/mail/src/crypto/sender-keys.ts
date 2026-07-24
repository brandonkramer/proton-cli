import { getCryptoProxy } from "./proxy.ts";
import { KEYS_ALL_PATH } from "../proton/constants.ts";
import { protonFetch } from "../proton/http.ts";
import { isSuccessCode, type Session } from "../proton/types.ts";

const publicKeyCache = new Map<string, unknown[]>();

export interface FetchSenderPublicKeysOptions {
  session?: Session | null;
  fetchImpl?: typeof fetch;
  /** Bypass cache (tests). */
  forceRefresh?: boolean;
}

interface KeysAllResponse {
  Code: number;
  Error?: string;
  Address?: {
    Keys?: { PublicKey?: string }[];
  };
}

function cacheKey(email: string): string {
  return email.trim().toLowerCase();
}

/** Clear in-memory sender public-key cache (tests). */
export function clearSenderKeyCache(): void {
  publicKeyCache.clear();
}

/**
 * Fetch + cache public keys for an email via GET /core/v4/keys/all.
 * Best-effort: returns [] on network/API/import failure.
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

  try {
    const path = `${KEYS_ALL_PATH}?Email=${encodeURIComponent(email.trim())}`;
    const { status, data } = await protonFetch<KeysAllResponse>(path, {
      session: options.session ?? null,
      fetchImpl: options.fetchImpl,
    });

    if (status !== 200 || !isSuccessCode(data.Code)) {
      publicKeyCache.set(key, []);
      return [];
    }

    const armored = (data.Address?.Keys ?? [])
      .map((entry) => entry.PublicKey)
      .filter((value): value is string => Boolean(value));

    if (armored.length === 0) {
      publicKeyCache.set(key, []);
      return [];
    }

    const CryptoProxy = await getCryptoProxy();
    const imported: unknown[] = [];
    for (const publicKey of armored) {
      try {
        imported.push(
          await CryptoProxy.importPublicKey({ armoredKey: publicKey }),
        );
      } catch {
        // skip unusable key
      }
    }

    publicKeyCache.set(key, imported);
    return imported;
  } catch {
    publicKeyCache.set(key, []);
    return [];
  }
}
