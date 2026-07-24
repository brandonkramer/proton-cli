import type { DecryptedUserKey } from "@bkramer/proton-core";
import { loadSession, persistSession } from "./proton/auth.ts";
import { refreshSession, verifySession } from "./proton/auth.ts";
import { ContactsClient } from "./proton/client.ts";
import type { Session } from "./proton/types.ts";
import { decryptUserKeys, fetchKeySalts, fetchUser } from "./proton/users.ts";
import { contactsPassRef } from "./util/agent.ts";
import { resolveAccountPassword } from "./util/password.ts";
import { CliError } from "./util/errors.ts";
import { ExitCode } from "./util/exit.ts";

export interface ContactsRuntime {
  session: Session;
  username: string;
  userKey: DecryptedUserKey;
  client: ContactsClient;
}

export async function requireContactsRuntime(options: {
  passRef?: string;
  fetchImpl?: typeof fetch;
} = {}): Promise<ContactsRuntime> {
  const saved = await loadSession();
  if (!saved) {
    throw new CliError("Not signed in to Contacts. Run `proton signin --products contacts`.", ExitCode.NOT_SIGNED_IN);
  }

  let session = saved.session;
  if (!(await verifySession(session))) {
    session = await refreshSession(session);
    await persistSession(session, saved.username);
  }

  const password = await resolveAccountPassword({
    passRef: options.passRef ?? contactsPassRef(),
  });
  const [user, salts] = await Promise.all([
    fetchUser(session),
    fetchKeySalts(session),
  ]);
  const userKeys = await decryptUserKeys(user, password, salts);
  const userKey = userKeys[0];
  if (!userKey) {
    throw new CliError("Could not unlock User Key for contacts.");
  }

  const client = new ContactsClient({
    session,
    userKey,
    fetchImpl: options.fetchImpl,
  });

  return {
    session,
    username: saved.username,
    userKey,
    client,
  };
}
