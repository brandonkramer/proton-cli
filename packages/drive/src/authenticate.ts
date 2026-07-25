import type { ProductAuthenticator } from "@bkramer/proton-core";
import {
  ensureFullScope,
  loginWithPassword,
  normalizeUsername,
  persistSession,
  sessionNeedsTotpUpgrade,
} from "./proton/auth.ts";

/**
 * Dual-mint authenticator for Drive API (drive-api.proton.me).
 * Persists product-local + shared session via store.saveSession.
 */
export const authenticateDrive: ProductAuthenticator = async (credentials) => {
  const username = normalizeUsername(credentials.username);
  let totp = credentials.totp;
  let session = await loginWithPassword({
    username,
    password: credentials.password,
    totp,
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
  return { product: "drive", session };
};
