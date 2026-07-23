import type { ProductId } from "./products.ts";

export interface Session {
  Code: number;
  AccessToken: string;
  RefreshToken: string;
  TokenType: string;
  Scopes: string[];
  UID: string;
  UserID: string;
  EventID?: string;
  ServerProof?: string;
  PasswordMode?: number;
  ExpiresIn: number;
  Error?: string;
  "2FA"?: {
    Enabled: number;
    TOTP: number;
  };
}

export interface SavedSession {
  product: ProductId;
  session: Session;
  username: string;
  savedAt: string;
  expiresAt: string;
}

export interface AccountRecord {
  username: string;
  products: ProductId[];
  savedAt: string;
}

export interface SignInCredentials {
  username: string;
  password: string;
  totp?: string;
  mailboxPassword?: string;
}

export interface ProductAuthResult {
  product: ProductId;
  session: Session;
  /** Extra product-specific unlock state (e.g. mailbox password accepted). */
  meta?: Record<string, unknown>;
}

export type ProductAuthenticator = (
  credentials: SignInCredentials,
) => Promise<ProductAuthResult>;

export interface DualSignInResult {
  username: string;
  succeeded: ProductId[];
  failed: Array<{ product: ProductId; error: string }>;
}
