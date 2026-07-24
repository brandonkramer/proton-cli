/** Proton Mail API host (REST; no Bridge/IMAP/SMTP). */
export const DEFAULT_API_URL = "https://mail-api.proton.me";

export const AUTH_INFO_PATH = "/auth/v4/info";
export const AUTH_PATH = "/auth/v4";
export const AUTH_2FA_PATH = "/auth/v4/2fa";
export const AUTH_REFRESH_PATH = "/auth/v4/refresh";
export const USERS_PATH = "/core/v4/users";
export const KEYS_SALTS_PATH = "/core/v4/keys/salts";
export const ADDRESSES_PATH = "/core/v4/addresses";
export const LABELS_PATH = "/core/v4/labels";
export const KEYS_ALL_PATH = "/core/v4/keys/all";

export const MAIL_MESSAGES_PATH = "/mail/v4/messages";
export const MAIL_CONVERSATIONS_PATH = "/mail/v4/conversations";
export const MAIL_MESSAGES_LABEL_PATH = `${MAIL_MESSAGES_PATH}/label`;
export const MAIL_MESSAGES_UNLABEL_PATH = `${MAIL_MESSAGES_PATH}/unlabel`;
export const MAIL_MESSAGES_READ_PATH = `${MAIL_MESSAGES_PATH}/read`;
export const MAIL_MESSAGES_UNREAD_PATH = `${MAIL_MESSAGES_PATH}/unread`;
export const MAIL_MESSAGES_DELETE_PATH = `${MAIL_MESSAGES_PATH}/delete`;

/** User label (Type=1). */
export const LABEL_TYPE_LABEL = 1;
/** Mail folder (Type=3). */
export const LABEL_TYPE_FOLDER = 3;

/** Default accent for new labels/folders (Proton palette). */
export const DEFAULT_LABEL_COLOR = "#7272a1";

/** System label IDs (Proton Mail API). */
export const LABEL_INBOX = "0";
export const LABEL_TRASH = "3";
export const LABEL_SPAM = "4";
export const LABEL_ALL = "5";
export const LABEL_ARCHIVE = "6";
export const LABEL_SENT = "7";
export const LABEL_DRAFTS = "8";
export const LABEL_STARRED = "10";

export const DEFAULT_PAGE_SIZE = 50;

const SYSTEM_LABELS: Record<string, string> = {
  inbox: LABEL_INBOX,
  trash: LABEL_TRASH,
  spam: LABEL_SPAM,
  all: LABEL_ALL,
  archive: LABEL_ARCHIVE,
  sent: LABEL_SENT,
  drafts: LABEL_DRAFTS,
  starred: LABEL_STARRED,
};

/** Resolve a system label name or pass through a numeric/custom label id. */
export function resolveLabelId(label?: string): string {
  if (!label) return LABEL_INBOX;
  const normalized = label.trim().toLowerCase();
  return SYSTEM_LABELS[normalized] ?? label;
}

export const PACKAGE_VERSION = "0.1.0";

/** Honest third-party Mail client id. */
export const APP_VERSION = "external-mail-proton_cli@0.1.0-stable";
export const USER_AGENT = `@bkramer/proton-cli/${PACKAGE_VERSION}`;
