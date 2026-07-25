import type { ProductId } from "./products.ts";
import {
  clearProductSession,
  saveAccount,
  saveProductSession,
} from "./store.ts";
import type {
  DualSignInResult,
  ProductAuthenticator,
  SignInCredentials,
} from "./types.ts";

/**
 * Products that authenticate against the same API host can share one session.
 * Contacts / Settings / Mail all use mail-api.proton.me.
 */
export const SESSION_SHARE_GROUPS: readonly (readonly ProductId[])[] = [
  ["contacts", "settings", "mail"],
] as const;

export function sessionSharePeers(product: ProductId): ProductId[] {
  for (const group of SESSION_SHARE_GROUPS) {
    if (group.includes(product)) return [...group];
  }
  return [product];
}

export function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b2028\b|too many recent logins/i.test(message);
}

export type DualSignInProgress =
  | { type: "start"; product: ProductId }
  | { type: "done"; product: ProductId; detail?: string }
  | { type: "error"; product: ProductId; error: string }
  | { type: "wait"; message: string }
  | { type: "shared"; product: ProductId; from: ProductId };

export interface DualSignInOptions {
  credentials: SignInCredentials;
  products: ProductId[];
  authenticators: Partial<Record<ProductId, ProductAuthenticator>>;
  /**
   * When true, keep successful product sessions even if another product fails.
   * Default false: on any failure, clear sessions written in this attempt.
   */
  partialOk?: boolean;
  /** Extra cleanup for product-local state when rolling back a failed dual mint. */
  clearers?: Partial<Record<ProductId, () => Promise<void>>>;
  /**
   * Called before each product mint. Use to refresh single-use TOTP codes
   * (VPN and Authenticator each consume a code on their own API host).
   */
  prepareCredentials?: (
    product: ProductId,
    credentials: SignInCredentials,
  ) => Promise<SignInCredentials>;
  /** Pause between product mints (default 8000). Set 0 to disable. */
  productGapMs?: number;
  /** Extra retries after API 2028 (default 2). */
  rateLimitRetries?: number;
  /** Wait before a 2028 retry (default 60000). */
  rateLimitWaitMs?: number;
  onProgress?: (event: DualSignInProgress) => void;
}

/**
 * Collect credentials once (caller), mint a session per product via injected
 * authenticators, and persist product-scoped sessions (Approach A).
 */
/** Best-effort reverse-order rollback so later mints are cleared first. */
async function rollbackMintAttempt(
  written: ProductId[],
  clearers?: Partial<Record<ProductId, () => Promise<void>>>,
): Promise<void> {
  for (const product of [...written].reverse()) {
    try {
      await clearProductSession(product);
    } catch {
      // Continue rolling back remaining products.
    }
    try {
      await clearers?.[product]?.();
    } catch {
      // Product clearer is best-effort.
    }
  }
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await Bun.sleep(ms);
}

export async function dualMintSignIn(
  options: DualSignInOptions,
): Promise<DualSignInResult> {
  const {
    credentials,
    products,
    authenticators,
    partialOk = false,
    clearers,
    prepareCredentials,
    productGapMs = 8_000,
    rateLimitRetries = 2,
    rateLimitWaitMs = 60_000,
    onProgress,
  } = options;
  const succeeded: ProductId[] = [];
  const failed: DualSignInResult["failed"] = [];
  const written: ProductId[] = [];
  const covered = new Set<ProductId>();
  let mintedCount = 0;

  for (const product of products) {
    if (covered.has(product)) continue;

    const authenticate = authenticators[product];
    if (!authenticate) {
      failed.push({
        product,
        error: `No authenticator registered for product "${product}".`,
      });
      continue;
    }

    if (mintedCount > 0 && productGapMs > 0) {
      const seconds = Math.round(productGapMs / 1000);
      onProgress?.({
        type: "wait",
        message: `Waiting ${seconds}s before ${product} (avoid login rate limits)…`,
      });
      await sleep(productGapMs);
    }

    onProgress?.({ type: "start", product });

    let lastError: string | undefined;
    let session: Awaited<ReturnType<ProductAuthenticator>>["session"] | undefined;
    let username = credentials.username;

    for (let attempt = 0; attempt <= rateLimitRetries; attempt++) {
      try {
        const creds = prepareCredentials
          ? await prepareCredentials(product, credentials)
          : credentials;
        username = creds.username;
        const result = await authenticate(creds);
        if (result.product !== product) {
          throw new Error(
            `Authenticator for ${product} returned session for ${result.product}.`,
          );
        }
        session = result.session;
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (isRateLimitError(error) && attempt < rateLimitRetries) {
          const seconds = Math.round(rateLimitWaitMs / 1000);
          onProgress?.({
            type: "wait",
            message: `Rate limited (2028) — waiting ${seconds}s, retry ${attempt + 1}/${rateLimitRetries}…`,
          });
          await sleep(rateLimitWaitMs);
          continue;
        }
        break;
      }
    }

    if (!session || lastError) {
      const error = lastError ?? "unknown error";
      failed.push({ product, error });
      onProgress?.({ type: "error", product, error });
      continue;
    }

    mintedCount += 1;
    const peers = sessionSharePeers(product).filter((peer) =>
      products.includes(peer),
    );

    for (const peer of peers) {
      await saveProductSession(peer, session, username);
      written.push(peer);
      covered.add(peer);
      if (!succeeded.includes(peer)) succeeded.push(peer);
      if (peer === product) {
        onProgress?.({ type: "done", product: peer });
      } else {
        onProgress?.({ type: "shared", product: peer, from: product });
        onProgress?.({
          type: "done",
          product: peer,
          detail: `shared with ${product}`,
        });
      }
    }
  }

  if (failed.length > 0 && !partialOk) {
    await rollbackMintAttempt(written, clearers);
    return {
      username: credentials.username,
      succeeded: [],
      failed,
    };
  }

  if (succeeded.length > 0) {
    await saveAccount(credentials.username, succeeded);
  }

  return {
    username: credentials.username,
    succeeded,
    failed,
  };
}
