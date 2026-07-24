import { CliError } from "./errors.ts";
import { ExitCode } from "./exit.ts";

/**
 * Agent safety gates for Mail mutations.
 *
 *   PROTONMAIL_READ_ONLY=1       — block send/reply/forward (and other writes)
 *   PROTONMAIL_ALLOW_SEND=false  — block send/reply/forward specifically
 *
 * Unset ALLOW_SEND defaults to allowed (unless read-only).
 */

function envFlag(name: string): boolean | undefined {
  const value = process.env[name];
  if (value === undefined || value === "") return undefined;
  if (value === "0" || value.toLowerCase() === "false") return false;
  return true;
}

export function isReadOnly(): boolean {
  return envFlag("PROTONMAIL_READ_ONLY") === true;
}

/** False when read-only or ALLOW_SEND is explicitly false. */
export function isSendAllowed(): boolean {
  if (isReadOnly()) return false;
  if (envFlag("PROTONMAIL_ALLOW_SEND") === false) return false;
  return true;
}

/** Throw unless send/reply/forward is permitted by env gates. */
export function assertSendAllowed(): void {
  if (isReadOnly()) {
    throw new CliError(
      "Send blocked: PROTONMAIL_READ_ONLY is set.",
      ExitCode.USAGE,
    );
  }
  if (envFlag("PROTONMAIL_ALLOW_SEND") === false) {
    throw new CliError(
      "Send blocked: PROTONMAIL_ALLOW_SEND=false.",
      ExitCode.USAGE,
    );
  }
}
