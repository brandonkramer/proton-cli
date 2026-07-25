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
 */
export const authenticateVpn: ProductAuthenticator = async (credentials) => {
  const username = normalizeUsername(credentials.username);
  let totp = credentials.totp;
  let session = await loginWithPassword({
    username,
    password: credentials.password,
    totp,
    refreshTotp: credentials.refreshTotp
      ? async () => {
          totp = await credentials.refreshTotp!();
          return totp;
        }
      : undefined,
  });

  if (sessionNeedsVpnTotp(session)) {
    if (!totp) {
      throw new Error("2FA code required to unlock VPN scope.");
    }
    session = await ensureVpnScope(session, totp);
  }

  await persistSession(session, username);
  return { product: "vpn", session };
};
