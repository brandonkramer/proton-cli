/** Proton Drive API host (roman-16 / go-proton-api reference). */
export const DEFAULT_API_URL = "https://drive-api.proton.me";

export const AUTH_INFO_PATH = "/auth/v4/info";
export const AUTH_PATH = "/auth/v4";
export const AUTH_2FA_PATH = "/auth/v4/2fa";
export const AUTH_REFRESH_PATH = "/auth/v4/refresh";
export const USERS_PATH = "/core/v4/users";
export const KEYS_SALTS_PATH = "/core/v4/keys/salts";
export const ADDRESSES_PATH = "/core/v4/addresses";

export const DRIVE_VOLUMES_PATH = "/drive/volumes";
export const DRIVE_BLOCKS_PATH = "/drive/blocks";

export const PACKAGE_VERSION = "0.1.0";

/** Honest third-party Drive client id (Proton external-drive-* policy). */
export const APP_VERSION = "external-drive-proton_cli@0.1.0-stable";
export const USER_AGENT = `@bkramer/proton-cli/${PACKAGE_VERSION}`;
