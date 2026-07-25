/**
 * Thin runtime shim around @protontech/crypto/srp.
 * Bootstrap CryptoProxy via a loader that resolves from this file so SRP and
 * the endpoint share one module instance (nested packages/<pkg>/node_modules can
 * otherwise duplicate @protontech/crypto vs @bkramer/proton-core).
 */
import { bootstrapCryptoProxy, ensureCryptoProxy } from "@bkramer/proton-core";

export interface AuthInfo {
  Version: number;
  Modulus: string;
  ServerEphemeral: string;
  Username?: string;
  Salt: string;
}

export interface AuthCredentials {
  username?: string;
  password: string;
}

export interface SrpProofs {
  clientEphemeral: string;
  clientProof: string;
  expectedServerProof: string;
  sharedSession: Uint8Array;
}

type GetSrp = (
  info: AuthInfo,
  credentials: AuthCredentials,
  authVersion?: number,
) => Promise<SrpProofs>;

export async function getSrp(
  info: AuthInfo,
  credentials: AuthCredentials,
  authVersion?: number,
): Promise<SrpProofs> {
  // Init the copy resolved from this package first (SRP), then warm core's
  // instance for shared unlock paths when resolution is unified.
  await bootstrapCryptoProxy((id) => import(id));
  await ensureCryptoProxy();
  const srpId = "@protontech/" + "crypto/srp";
  const mod = (await import(srpId)) as { getSrp: GetSrp };
  return mod.getSrp(info, credentials, authVersion);
}
