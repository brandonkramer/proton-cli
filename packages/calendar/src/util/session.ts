import {
  persistSession,
  refreshSession,
  verifySession,
} from "../proton/auth.ts";
import { loadSession } from "../config/store.ts";
import type { SavedSession } from "../proton/types.ts";
import { fail } from "./agent.ts";

export async function requireSession(): Promise<SavedSession> {
  const saved = await loadSession();
  if (!saved) {
    fail("Not signed in. Run: proton signin --products calendar");
  }
  let session = saved.session;
  if (!(await verifySession(session))) {
    session = await refreshSession(session);
    await persistSession(session, saved.username);
    saved.session = session;
  }
  return saved;
}
