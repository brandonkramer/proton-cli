import {
  saveProductSession,
  type ProductAuthenticator,
} from "@proton-cli/core";
import {
  ensureFullScope,
  loginWithPassword,
  normalizeUsername,
  persistSession,
} from "./proton/auth.ts";

/**
 * Dual-mint authenticator for Authenticator API (authenticator-api.proton.me).
 * Also writes the product-local session.json used by auth commands.
 */
export const authenticateAuthenticator: ProductAuthenticator = async (
  credentials,
) => {
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
  await saveProductSession("authenticator", session, username);

  return { product: "authenticator", session };
};
