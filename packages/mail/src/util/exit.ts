/** Process exit codes for Mail commands (roman-16 aligned). */
export const MailExitCode = {
  OK: 0,
  /** Invalid usage, bad message ref, user input errors. */
  USER: 1,
  /** Missing/invalid config, auth failure, password resolution. */
  AUTH: 2,
  /** Mailbox or message not found. */
  NOT_FOUND: 3,
  /** Ambiguous or conflicting state. */
  CONFLICT: 4,
  /** Network failure, Bridge unreachable, TLS/connect errors. */
  NETWORK: 5,
} as const;

export type MailExitCodeValue = (typeof MailExitCode)[keyof typeof MailExitCode];
