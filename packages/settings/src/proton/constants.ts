/**
 * Proton Mail/Account API host for settings + auth SRP.
 *
 * Older clients used `https://mail.proton.me/api`; modern clients use
 * `mail-api.proton.me` for the same `/core/v4/*` and `/mail/v4/*` paths.
 * Account-only `account-api.proton.me` is not used here — settings get/mail
 * share this host (see RESEARCH.md U1 resolution).
 */
export const DEFAULT_API_URL = "https://mail-api.proton.me";

export const AUTH_INFO_PATH = "/auth/v4/info";
export const AUTH_PATH = "/auth/v4";
export const AUTH_2FA_PATH = "/auth/v4/2fa";
export const AUTH_REFRESH_PATH = "/auth/v4/refresh";
export const USERS_PATH = "/core/v4/users";

export const SETTINGS_ACCOUNT_PATH = "/core/v4/settings";
export const SETTINGS_MAIL_PATH = "/mail/v4/settings";

export const PACKAGE_VERSION = "0.1.0";

/**
 * `external-settings-*` is rejected on mail-api. Settings share mail-api with
 * Mail; use a current web-mail client id (probed: web-mail@5.0.70.0 → 1000).
 */
export const APP_VERSION = "web-mail@5.0.70.0";
export const USER_AGENT = `@bkramer/proton-cli/${PACKAGE_VERSION}`;
