import {
  saveProductSession,
  type ProductAuthenticator,
} from "@proton-cli/core";
import {
  ensureVpnScope,
  loginWithPassword,
  normalizeUsername,
  persistSession,
  sessionNeedsVpnTotp,
} from "./proton/auth.ts";

/**
 * Dual-mint authenticator for VPN (vpn-api.proton.me).
 * Also writes the product-local session.json used by VPN commands.
 */
export const authenticateVpn: ProductAuthenticator = async (credentials) => {
  const username = normalizeUsername(credentials.username);
  let session = await loginWithPassword({
    username,
    password: credentials.password,
    totp: credentials.totp,
  });

  if (sessionNeedsVpnTotp(session)) {
    if (!credentials.totp) {
      throw new Error("2FA code required to unlock VPN scope.");
    }
    session = await ensureVpnScope(session, credentials.totp);
  }

  await persistSession(session, username);
  await saveProductSession("vpn", session, username);

  return { product: "vpn", session };
};
