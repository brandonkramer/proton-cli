import type { ProductAuthenticator } from "@bkramer/proton-core";
import {
  ensureFullScope,
  loginWithPassword,
  normalizeUsername,
  persistSession,
  sessionNeedsTotpUpgrade,
  tryExistingSession,
} from "./proton/auth.ts";

/**
 * Dual-mint authenticator for Calendar API (calendar-api.proton.me).
 */
export const authenticateCalendar: ProductAuthenticator = async (credentials) => {
  const username = normalizeUsername(credentials.username);
  const existing = await tryExistingSession(username);
  if (existing) {
    return { product: "calendar", session: existing.session };
  }

  let totp = credentials.totp;
  let session = await loginWithPassword({
    username,
    password: credentials.password,
    refreshTotp: credentials.refreshTotp,
  });

  if (sessionNeedsTotpUpgrade(session)) {
    if (credentials.refreshTotp) {
      totp = await credentials.refreshTotp(totp);
    }
    if (!totp) {
      throw new Error("2FA code required.");
    }
    session = await ensureFullScope(session, totp);
  }

  await persistSession(session, username);
  return { product: "calendar", session };
};
