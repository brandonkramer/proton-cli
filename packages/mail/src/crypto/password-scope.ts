import { getSrp } from "../shims/proton-srp.ts";
import { mailApi } from "../proton/api.ts";
import { CORE_AUTH_INFO_PATH, USERS_PASSWORD_PATH } from "../proton/constants.ts";
import type { Session } from "../proton/types.ts";

/**
 * SRP re-auth within the session — unlocks the locked password scope so
 * `/core/v4/keys/salts` (and other sensitive key endpoints) succeed.
 */
export async function unlockPasswordScope(options: {
  session: Session;
  username: string;
  password: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const info = await mailApi<{
    Version: number;
    Modulus: string;
    ServerEphemeral: string;
    Salt: string;
    SRPSession: string;
  }>(CORE_AUTH_INFO_PATH, {
    method: "POST",
    body: { Username: options.username },
    session: options.session,
    fetchImpl: options.fetchImpl,
  });

  const proofs = await getSrp(
    {
      Version: info.Version,
      Modulus: info.Modulus,
      ServerEphemeral: info.ServerEphemeral,
      Salt: info.Salt,
    },
    { username: options.username, password: options.password },
  );

  await mailApi(USERS_PASSWORD_PATH, {
    method: "PUT",
    body: {
      ClientProof: proofs.clientProof,
      ClientEphemeral: proofs.clientEphemeral,
      SRPSession: info.SRPSession,
    },
    session: options.session,
    fetchImpl: options.fetchImpl,
  });
}
