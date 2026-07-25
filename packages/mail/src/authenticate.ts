import type { ProductAuthenticator } from "@bkramer/proton-core";
import {
  ensureFullScope,
  loginWithPassword,
  normalizeUsername,
  persistSession,
  sessionNeedsTotpUpgrade,
} from "./proton/auth.ts";

/**
 * Dual-mint authenticator for Mail API (mail-api.proton.me).
 * Persists product-local + shared session via store.saveSession.
 *
 * Password (/auth) and TOTP (/auth/v4/2fa) are separate steps. Sending TOTP on
 * /auth during a CAPTCHA challenge often yields post-CAPTCHA 8002 (mapped as
 * wrong password).
 */
export const authenticateMail: ProductAuthenticator = async (credentials) => {
  const username = normalizeUsername(credentials.username);
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
  return { product: "mail", session };
};
