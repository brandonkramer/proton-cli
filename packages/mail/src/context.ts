import type { DecryptedUserKey } from "@bkramer/proton-core";
import {
  unlockMailKeys,
  type ProtonAddress,
  type UnlockedAddressKey,
} from "./crypto/unlock.ts";
import { loadSession, persistSession, refreshSession, verifySession } from "./proton/auth.ts";
import type { Session } from "./proton/types.ts";
import { resolveAccountPassword } from "./util/password.ts";
import { CliError } from "./util/errors.ts";
import { ExitCode } from "./util/exit.ts";

export interface MailRuntime {
  session: Session;
  username: string;
  /** Unlocked user keys (PH1+). */
  userKeys?: DecryptedUserKey[];
  /** Primary unlocked user key — convenience for callers. */
  userKey?: DecryptedUserKey;
  /** Unlocked address key rings keyed by AddressID (INV-E2EE-001). */
  addressKeys?: Map<string, UnlockedAddressKey>;
  addresses?: ProtonAddress[];
}

export async function requireMailRuntime(options: {
  passRef?: string;
  fetchImpl?: typeof fetch;
  unlockKeys?: boolean;
} = {}): Promise<MailRuntime> {
  const saved = await loadSession();
  if (!saved) {
    throw new CliError(
      "Not signed in to Mail. Run `proton signin --products mail`.",
      ExitCode.NOT_SIGNED_IN,
    );
  }

  let session = saved.session;
  if (!(await verifySession(session))) {
    session = await refreshSession(session);
    await persistSession(session, saved.username);
  }

  const runtime: MailRuntime = {
    session,
    username: saved.username,
  };

  if (options.unlockKeys) {
    const password = await resolveAccountPassword({ passRef: options.passRef });
    const unlocked = await unlockMailKeys(
      session,
      password,
      options.fetchImpl,
    );
    const userKey = unlocked.userKeys[0];
    if (!userKey) {
      throw new CliError("Could not unlock User Key for mail.");
    }
    runtime.userKeys = unlocked.userKeys;
    runtime.userKey = userKey;
    runtime.addressKeys = unlocked.addressKeys;
    runtime.addresses = unlocked.addresses;
  }

  return runtime;
}
