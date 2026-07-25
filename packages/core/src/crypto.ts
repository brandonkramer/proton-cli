/**
 * Shared CryptoProxy bootstrap for SRP / OpenPGP.
 * VPN and Authenticator must share one init — `@protontech/crypto` throws
 * "already initialised" if `setEndpoint` is called twice on the *same* module
 * instance. Bun can also install duplicate copies under packages/<pkg>/node_modules;
 * callers that import SRP from a product package should bootstrap with a loader
 * that resolves from that package (see `bootstrapCryptoProxy`).
 *
 * Module ids are built at runtime so `tsc` does not typecheck Proton's published .ts.
 */

interface CryptoApiLike {
  clearKeyStore: () => Promise<unknown> | unknown;
}

interface CryptoApiConstructor {
  new (): CryptoApiLike;
  init: (options: Record<string, never>) => void;
}

export interface CryptoProxyLike {
  setEndpoint: (
    endpoint: CryptoApiLike,
    onRelease?: (endpoint: CryptoApiLike) => unknown,
  ) => void;
  importPrivateKey: (options: {
    armoredKey: string;
    passphrase: string | null;
  }) => Promise<unknown>;
  importPublicKey: (options: { armoredKey: string }) => Promise<unknown>;
  encryptMessage: (options: {
    binaryData: Uint8Array;
    encryptionKeys: unknown[];
    signingKeys: unknown[];
    format: "binary";
  }) => Promise<{ message: Uint8Array }>;
  decryptMessage: (options: {
    binaryMessage: Uint8Array;
    decryptionKeys: unknown[];
    verificationKeys: unknown[];
    format: "binary";
    expectSigned: boolean;
  }) => Promise<{ data: Uint8Array }>;
}

export type CryptoModuleLoader = (specifier: string) => Promise<unknown>;

let cryptoReady: Promise<CryptoProxyLike> | null = null;

/**
 * Initialize CryptoProxy for whatever `@protontech/crypto` instance `load`
 * resolves. Pass `(id) => import(id)` from a product shim so SRP and the
 * endpoint share one physical module (avoids "endpoint not initialized").
 */
export async function bootstrapCryptoProxy(
  load: CryptoModuleLoader,
): Promise<CryptoProxyLike> {
  const cryptoId = "@protontech/" + "crypto";
  const apiId = "@protontech/" + "crypto/proxy/endpoint/api.ts";

  const { CryptoProxy } = (await load(cryptoId)) as {
    CryptoProxy: CryptoProxyLike;
  };
  const { Api: CryptoApi } = (await load(apiId)) as {
    Api: CryptoApiConstructor;
  };

  CryptoApi.init({});
  try {
    CryptoProxy.setEndpoint(new CryptoApi(), (endpoint) =>
      endpoint.clearKeyStore(),
    );
  } catch (error) {
    // Same instance may already be initialised; reuse it.
    if (
      !(error instanceof Error) ||
      error.message !== "already initialised"
    ) {
      throw error;
    }
  }
  return CryptoProxy;
}

export async function getCryptoProxy(): Promise<CryptoProxyLike> {
  if (cryptoReady) return cryptoReady;

  cryptoReady = bootstrapCryptoProxy((id) => import(id));

  try {
    return await cryptoReady;
  } catch (error) {
    cryptoReady = null;
    throw error;
  }
}

/** Ensure CryptoProxy is ready (VPN SRP only needs init, not the proxy handle). */
export async function ensureCryptoProxy(): Promise<void> {
  await getCryptoProxy();
}
