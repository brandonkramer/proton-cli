/** Proton Calendar API host. */
export const DEFAULT_API_URL = "https://calendar-api.proton.me";

export const AUTH_INFO_PATH = "/auth/v4/info";
export const AUTH_PATH = "/auth/v4";
export const AUTH_2FA_PATH = "/auth/v4/2fa";
export const AUTH_REFRESH_PATH = "/auth/v4/refresh";
export const USERS_PATH = "/core/v4/users";
export const ADDRESSES_PATH = "/core/v4/addresses";
export const KEY_SALTS_PATH = "/core/v4/keys/salts";
export const CORE_AUTH_INFO_PATH = "/core/v4/auth/info";
export const USERS_PASSWORD_PATH = "/core/v4/users/password";

export const CALENDARS_PATH = "/calendar/v1";
export const KEYS_ALL_PATH = "/core/v4/keys/all";

export const PACKAGE_VERSION = "0.1.0";

/**
 * Calendar API rejects `external-calendar-*` (5002 Invalid app version).
 * `external-drive-*` is allowlisted broadly, but prefer an honest web-calendar
 * client id that calendar-api accepts (probed: web-calendar@5.0.50.0 → 1000).
 */
export const APP_VERSION = "web-calendar@5.0.50.0";
export const USER_AGENT = `@bkramer/proton-cli/${PACKAGE_VERSION}`;
