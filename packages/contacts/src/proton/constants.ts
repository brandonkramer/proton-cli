/** Proton Contacts API host. */
export const DEFAULT_API_URL = "https://contacts-api.proton.me";

export const AUTH_INFO_PATH = "/auth/v4/info";
export const AUTH_PATH = "/auth/v4";
export const AUTH_2FA_PATH = "/auth/v4/2fa";
export const AUTH_REFRESH_PATH = "/auth/v4/refresh";
export const USERS_PATH = "/core/v4/users";
export const KEYS_SALTS_PATH = "/core/v4/keys/salts";

export const CONTACTS_EXPORT_PATH = "/contacts/v4/contacts/export";
export const CONTACTS_PATH = "/contacts/v4/contacts";
export const CONTACTS_DELETE_PATH = "/contacts/v4/contacts/delete";
export const CONTACTS_LABEL_PATH = "/contacts/v4/contacts/label";
export const CONTACTS_UNLABEL_PATH = "/contacts/v4/contacts/unlabel";

export const LABELS_PATH = "/core/v4/labels";

/** Contact group labels (Type=2). */
export const CONTACT_GROUP_LABEL_TYPE = 2;

export const DEFAULT_PAGE_SIZE = 50;

export const PACKAGE_VERSION = "0.1.0";

/** Honest third-party Contacts client id. */
export const APP_VERSION = "external-contacts-proton_cli@0.1.0-stable";
export const USER_AGENT = `@bkramer/proton-cli/${PACKAGE_VERSION}`;
