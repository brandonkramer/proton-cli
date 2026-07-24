import type { DecryptedUserKey } from "@bkramer/proton-core";
import { loadSession, persistSession, refreshSession, verifySession } from "./proton/auth.ts";
import type { Session } from "./proton/types.ts";
import { decryptUserKeys, fetchKeySalts, fetchUser } from "./proton/users.ts";
import { resolveAccountPassword } from "./util/password.ts";
import { CliError } from "./util/errors.ts";
import { ExitCode } from "./util/exit.ts";

export interface MailRuntime {
  session: Session;
  username: string;
  /** Unlocked user key — required for E2EE mail (PH0-T02+). */
  userKey?: DecryptedUserKey;
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
    const [user, salts] = await Promise.all([
      fetchUser(session, options.fetchImpl),
      fetchKeySalts(session, options.fetchImpl),
    ]);
    const userKeys = await decryptUserKeys(user, password, salts);
    const userKey = userKeys[0];
    if (!userKey) {
      throw new CliError("Could not unlock User Key for mail.");
    }
    runtime.userKey = userKey;
  }

  return runtime;
}
