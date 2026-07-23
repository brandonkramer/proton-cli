/**
 * Official Authenticator API host (android/ios use apiPrefix `authenticator-api`).
 * Serves auth, core, and `authenticator/v1/*`. `mail.proton.me/api` 404s the latter.
 */
export const DEFAULT_API_URL = "https://authenticator-api.proton.me/api";

export const AUTH_INFO_PATH = "/auth/v4/info";
export const AUTH_PATH = "/auth/v4";
export const AUTH_2FA_PATH = "/auth/v4/2fa";
export const AUTH_REFRESH_PATH = "/auth/v4/refresh";
export const USERS_PATH = "/core/v4/users";
export const KEYS_SALTS_PATH = "/core/v4/keys/salts";

export const AUTHENTICATOR_KEY_PATH = "/authenticator/v1/key";
export const AUTHENTICATOR_ENTRY_PATH = "/authenticator/v1/entry";
export const AUTHENTICATOR_ENTRY_BULK_PATH = "/authenticator/v1/entry/bulk";

export const CONTENT_FORMAT_VERSION = 1;

export const PACKAGE_VERSION = "0.1.0";

/**
 * Honest platform Authenticator client id.
 *
 * Proton rejects `external-authenticator-cli@…` today (not allowlisted).
 * Do not spoof android/ios official builds. Use `{platform}-authenticator@{semver}`.
 */
export function appVersionHeader(): string {
  const platform =
    process.platform === "darwin"
      ? "macos"
      : process.platform === "win32"
        ? "windows"
        : "linux";
  return `${platform}-authenticator@${PACKAGE_VERSION}`;
}

export const APP_VERSION = appVersionHeader();
export const USER_AGENT = `@bkramer/proton-cli/${PACKAGE_VERSION}`;
