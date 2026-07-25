import type { ProductAuthenticator } from "@bkramer/proton-core";
import {
  ensureVpnScope,
  loginWithPassword,
  normalizeUsername,
  persistSession,
  sessionNeedsVpnTotp,
} from "./proton/auth.ts";

/**
 * Dual-mint authenticator for VPN (vpn-api.proton.me).
 * Persists product-local + shared session via store.saveSession.
 *
 * Password (/auth) and TOTP (/auth/2fa) are separate steps so CAPTCHA can
 * complete without a burned TwoFactorCode on the password request.
 */
export const authenticateVpn: ProductAuthenticator = async (credentials) => {
  const username = normalizeUsername(credentials.username);
  let totp = credentials.totp;
  let session = await loginWithPassword({
    username,
    password: credentials.password,
    refreshTotp: credentials.refreshTotp,
  });

  if (sessionNeedsVpnTotp(session)) {
    if (credentials.refreshTotp) {
      totp = await credentials.refreshTotp(totp);
    }
    if (!totp) {
      throw new Error("2FA code required to unlock VPN scope.");
    }
    session = await ensureVpnScope(session, totp);
  }

  await persistSession(session, username);
  return { product: "vpn", session };
};
