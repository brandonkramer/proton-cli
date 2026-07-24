/** Proton Mail API host (REST; no Bridge/IMAP/SMTP). */
export const DEFAULT_API_URL = "https://mail-api.proton.me";

export const AUTH_INFO_PATH = "/auth/v4/info";
export const AUTH_PATH = "/auth/v4";
export const AUTH_2FA_PATH = "/auth/v4/2fa";
export const AUTH_REFRESH_PATH = "/auth/v4/refresh";
export const USERS_PATH = "/core/v4/users";
export const KEYS_SALTS_PATH = "/core/v4/keys/salts";

/** Mail messages API — not wired yet (PH0-T02+). */
export const MAIL_MESSAGES_PATH = "/mail/v4/messages";

export const PACKAGE_VERSION = "0.1.0";

/** Honest third-party Mail client id. */
export const APP_VERSION = "external-mail-proton_cli@0.1.0-stable";
export const USER_AGENT = `@bkramer/proton-cli/${PACKAGE_VERSION}`;
