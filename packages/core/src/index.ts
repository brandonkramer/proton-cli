export {
  PRODUCTS,
  isProductId,
  parseProductList,
  productNamespace,
  type ProductId,
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
  clearAllSessions,
  clearProductSession,
  listSavedSessions,
  loadAccount,
  loadProductSession,
  saveAccount,
  saveProductSession,
} from "./store.ts";
export { dualMintSignIn, type DualSignInOptions } from "./signin.ts";
export type {
  AccountRecord,
  DualSignInResult,
  ProductAuthResult,
  ProductAuthenticator,
  SavedSession,
  Session,
  SignInCredentials,
} from "./types.ts";
