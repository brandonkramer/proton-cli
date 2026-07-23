import type {
  ProductAuthenticator,
  SignInCredentials,
} from "@proton-cli/core";

/**
 * Placeholder until the full authenticator-api SRP + key unlock flow is ported.
 * Real implementation must mint a session against authenticator-api.proton.me only.
 */
export const authenticateAuthenticator: ProductAuthenticator = async (
  _credentials: SignInCredentials,
) => {
  throw new Error(
    "Authenticator authenticator not ported yet. Use the sibling proton-authenticator-cli for live sign-in, or wait for PH2 port.",
  );
};
