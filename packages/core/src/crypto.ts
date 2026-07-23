/**
 * Shared CryptoProxy bootstrap for SRP / OpenPGP.
 * VPN and Authenticator must share one init — `@protontech/crypto` throws
 * "already initialised" if `setEndpoint` is called twice in-process.
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

let cryptoReady: Promise<CryptoProxyLike> | null = null;

export async function getCryptoProxy(): Promise<CryptoProxyLike> {
  if (cryptoReady) return cryptoReady;

  cryptoReady = (async () => {
    const cryptoId = "@protontech/" + "crypto";
    const apiId = "@protontech/" + "crypto/proxy/endpoint/api.ts";

    const { CryptoProxy } = (await import(cryptoId)) as {
      CryptoProxy: CryptoProxyLike;
    };
    const { Api: CryptoApi } = (await import(apiId)) as {
      Api: CryptoApiConstructor;
    };

    CryptoApi.init({});
    try {
      CryptoProxy.setEndpoint(new CryptoApi(), (endpoint) =>
        endpoint.clearKeyStore(),
      );
    } catch (error) {
      // Another package may have won a race; reuse the existing endpoint.
      if (
        !(error instanceof Error) ||
        error.message !== "already initialised"
      ) {
        throw error;
      }
    }
    return CryptoProxy;
  })();

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
