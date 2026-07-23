import type {
  ProductAuthenticator,
  SignInCredentials,
} from "@proton-cli/core";

/**
 * Placeholder until the full vpn-api SRP flow is ported from proton-vpn-cli.
 * Real implementation must mint a session against vpn-api.proton.me only.
 */
export const authenticateVpn: ProductAuthenticator = async (
  _credentials: SignInCredentials,
) => {
  throw new Error(
    "VPN authenticator not ported yet. Use the sibling proton-vpn-cli for live VPN sign-in, or wait for PH2 port.",
  );
};
