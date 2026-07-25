export {
  PRODUCTS,
  isProductId,
  parseProductList,
  productNamespace,
  type ProductId,
  type ProductNamespace,
} from "./products.ts";
export {
  accountPath,
  configRoot,
  productDataDir,
  sessionPath,
  sessionsDir,
  setConfigRootForTests,
} from "./paths.ts";
export {
  clearAccount,
  clearAccountPassRef,
  clearAllSessions,
  clearProductSession,
  listSavedSessions,
  loadAccount,
  loadProductSession,
  saveAccount,
  saveAccountPassRef,
  saveProductSession,
} from "./store.ts";
export {
  dualMintSignIn,
  isRateLimitError,
  sessionSharePeers,
  SESSION_SHARE_GROUPS,
  type DualSignInOptions,
  type DualSignInProgress,
} from "./signin.ts";
export {
  bootstrapCryptoProxy,
  ensureCryptoProxy,
  getCryptoProxy,
  type CryptoProxyLike,
} from "./crypto.ts";
export {
  computeKeyPassword,
  unlockUserKeys,
  unlockUserKeysWithFetch,
  type DecryptedUserKey,
  type KeySalt,
  type ProtonUser,
  type ProtonUserKey,
  type UnlockUserKeysWithFetchOptions,
} from "./unlock.ts";
export {
  canonicalizePassItemRef,
  looksLikePassId,
  msUntilNextTotpWindow,
  normalizePassItemRef,
  PASS_ENV_CANDIDATES,
  resolveFreshPassTotp,
  resolvePassLogin,
  resolvePassRef,
  resolvePassRefFromEnv,
  resolvePassTotp,
  type CanonicalPassRef,
  type PassLoginFields,
} from "./pass.ts";
export type {
  AccountRecord,
  DualSignInResult,
  ProductAuthResult,
  ProductAuthenticator,
  SavedSession,
  Session,
  SignInCredentials,
} from "./types.ts";
export {
  API_CODE_HUMAN_VERIFICATION,
  HumanVerificationError,
  humanVerificationHeaders,
  isHumanVerificationError,
  solveCaptchaInBrowser,
  type HumanVerificationDetails,
  type HumanVerificationResult,
} from "./human-verification.ts";
