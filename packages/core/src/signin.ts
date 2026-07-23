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
}

/**
 * Collect credentials once (caller), mint a session per product via injected
 * authenticators, and persist product-scoped sessions (Approach A).
 */
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
  } = options;
  const succeeded: ProductId[] = [];
  const failed: DualSignInResult["failed"] = [];
  const written: ProductId[] = [];

  for (const product of products) {
    const authenticate = authenticators[product];
    if (!authenticate) {
      failed.push({
        product,
        error: `No authenticator registered for product "${product}".`,
      });
      continue;
    }

    try {
      const creds = prepareCredentials
        ? await prepareCredentials(product, credentials)
        : credentials;
      const result = await authenticate(creds);
      if (result.product !== product) {
        throw new Error(
          `Authenticator for ${product} returned session for ${result.product}.`,
        );
      }
      await saveProductSession(product, result.session, creds.username);
      written.push(product);
      succeeded.push(product);
    } catch (error) {
      failed.push({
        product,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failed.length > 0 && !partialOk) {
    await Promise.all(
      written.map(async (p) => {
        await clearProductSession(p);
        await clearers?.[p]?.();
      }),
    );
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
