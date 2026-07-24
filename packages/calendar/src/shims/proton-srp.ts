import { ensureCryptoProxy } from "@bkramer/proton-core";

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
  await ensureCryptoProxy();
  const srpId = "@protontech/" + "crypto/srp";
  const mod = (await import(srpId)) as { getSrp: GetSrp };
  return mod.getSrp(info, credentials, authVersion);
}
