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
  let session = await loginWithPassword({
    username,
    password: credentials.password,
    totp: credentials.totp,
  });

  if (credentials.totp) {
    session = await ensureFullScope(session, credentials.totp);
  }

  await persistSession(session, username);
  return { product: "mail", session };
};
