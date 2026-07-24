/**
 * Share-link URL password helpers — runtime access to @protontech/crypto/srp
 * internals via the published `./srp` export + resolved sibling modules.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ensureCryptoProxy } from "@bkramer/proton-core";

export interface ShareHashPasswordOptions {
  version: number;
  password: string;
  salt?: string;
  username?: string;
  modulus: Uint8Array;
}

type HashPasswordFn = (options: ShareHashPasswordOptions) => Promise<Uint8Array>;
type VerifyAndGetModulusFn = (modulus: string) => Promise<Uint8Array>;
type GetRandomSrpVerifierFn = (
  serverModulus: { Modulus: string },
  credentials: { username: string; password: string },
  version?: number,
) => Promise<{ version: number; salt: string; verifier: string }>;

export interface ShareSrpModule {
  hashPassword: HashPasswordFn;
  verifyAndGetModulus: VerifyAndGetModulusFn;
  getRandomSrpVerifier: GetRandomSrpVerifierFn;
}

let shareSrpPromise: Promise<ShareSrpModule> | undefined;

async function loadShareSrpModule(): Promise<ShareSrpModule> {
  await ensureCryptoProxy();
  const srpId = "@protontech/" + "crypto/srp";
  const require = createRequire(import.meta.url);
  const srpDir = path.dirname(require.resolve(srpId));
  const [passwords, modulusUtils, srp] = await Promise.all([
    import(pathToFileURL(path.join(srpDir, "passwords.ts")).href) as Promise<{
      hashPassword: HashPasswordFn;
    }>,
    import(pathToFileURL(path.join(srpDir, "utils/modulus.ts")).href) as Promise<{
      verifyAndGetModulus: VerifyAndGetModulusFn;
    }>,
    import(srpId) as Promise<{ getRandomSrpVerifier: GetRandomSrpVerifierFn }>,
  ]);
  return {
    hashPassword: passwords.hashPassword,
    verifyAndGetModulus: modulusUtils.verifyAndGetModulus,
    getRandomSrpVerifier: srp.getRandomSrpVerifier,
  };
}

export async function getShareSrpModule(): Promise<ShareSrpModule> {
  shareSrpPromise ??= loadShareSrpModule();
  return shareSrpPromise;
}
