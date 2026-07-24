import { verifySession } from "../proton/auth.ts";
import { loadSession } from "../config/store.ts";
import type { SavedSession } from "../proton/types.ts";
import { fail } from "./agent.ts";

export async function requireSession(): Promise<SavedSession> {
  const saved = await loadSession();
  if (!saved) {
    fail("Not signed in. Run: proton signin --products calendar");
  }
  const valid = await verifySession(saved.session);
  if (!valid) {
    fail("Calendar session expired. Run: proton signin --products calendar");
  }
  return saved;
}
