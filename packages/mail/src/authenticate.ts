import type { ProductAuthenticator } from "@bkramer/proton-core";
import {
  ensureFullScope,
  loginWithPassword,
  normalizeUsername,
  persistSession,
} from "./proton/auth.ts";

/**
 * Dual-mint authenticator for Mail API (mail-api.proton.me).
 * Persists product-local + shared session via store.saveSession.
 */
export const authenticateMail: ProductAuthenticator = async (credentials) => {
  const username = normalizeUsername(credentials.username);
  let totp = credentials.totp;
  let session = await loginWithPassword({
    username,
    password: credentials.password,
    totp,
    refreshTotp: credentials.refreshTotp
      ? async () => {
          totp = await credentials.refreshTotp!(totp);
          return totp;
        }
      : undefined,
  });

  if (totp) {
    session = await ensureFullScope(session, totp);
  }

  await persistSession(session, username);
  return { product: "mail", session };
};
