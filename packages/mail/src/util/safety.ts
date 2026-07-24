import { envFlagEnabled } from "./agent.ts";
import { CliError } from "./errors.ts";
import { MailExitCode } from "./exit.ts";

const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

/**
 * Agent safety envs (see NFR-AGENT-001):
 * - PROTONMAIL_READ_ONLY — block IMAP/SMTP mutations (send, organize, drafts save/delete)
 * - PROTONMAIL_ALLOW_SEND — when false/0/no/off, block outbound SMTP
 * - PROTONMAIL_CONFIRM_DESTRUCTIVE — when set, permit delete without --yes
 * Also: PROTONMAIL_AGENT / PROTONMAIL_OUTPUT=json for scripting defaults.
 */

function envFlagDisabled(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value !== undefined && FALSE_VALUES.has(value);
}

/** Whether read-only agent mode is active. */
export function isReadOnlyMode(): boolean {
  return envFlagEnabled("PROTONMAIL_READ_ONLY");
}

/** Whether outbound SMTP send is permitted by agent safety envs. */
export function isSendAllowed(): boolean {
  if (isReadOnlyMode()) {
    return false;
  }
  if (envFlagDisabled("PROTONMAIL_ALLOW_SEND")) {
    return false;
  }
  return true;
}

/** Whether destructive actions (delete) are permitted without an interactive prompt. */
export function isDestructiveConfirmed(options?: { yes?: boolean }): boolean {
  if (options?.yes === true) {
    return true;
  }
  return envFlagEnabled("PROTONMAIL_CONFIRM_DESTRUCTIVE");
}

/** Refuse IMAP/SMTP mutations when PROTONMAIL_READ_ONLY is enabled. */
export function assertMutationAllowed(): void {
  if (isReadOnlyMode()) {
    throw new CliError(
      "Mutation blocked: PROTONMAIL_READ_ONLY is enabled.",
      "mutation_blocked_read_only",
      MailExitCode.USER,
    );
  }
}

/** Refuse send/reply/forward/draft-send when read-only or allow-send is disabled. */
export function assertSendAllowed(): void {
  if (isReadOnlyMode()) {
    throw new CliError(
      "Send blocked: PROTONMAIL_READ_ONLY is enabled.",
      "send_blocked_read_only",
      MailExitCode.USER,
    );
  }

  if (envFlagDisabled("PROTONMAIL_ALLOW_SEND")) {
    throw new CliError(
      "Send blocked: PROTONMAIL_ALLOW_SEND=false.\n" +
        "Set PROTONMAIL_ALLOW_SEND=true to permit outbound mail.",
      "send_blocked",
      MailExitCode.USER,
    );
  }
}

/** Refuse permanent delete unless --yes or PROTONMAIL_CONFIRM_DESTRUCTIVE is set. */
export function assertDestructiveAllowed(options?: { yes?: boolean }): void {
  assertMutationAllowed();
  if (isDestructiveConfirmed(options)) {
    return;
  }
  throw new CliError(
    "Destructive action blocked. Pass --yes or set PROTONMAIL_CONFIRM_DESTRUCTIVE=1.",
    "destructive_blocked",
    MailExitCode.USER,
  );
}
