import { CliError } from "./errors.ts";
import { MailExitCode, type MailExitCodeValue } from "./exit.ts";

const AUTH_PATTERN =
  /auth(entication)? (fail|error)|invalid credentials|login fail|no auth|authenticationfailed|AUTHENTICATIONFAILED/i;
const NOT_FOUND_PATTERN =
  /not found|unknown mailbox|no such message|NONEXISTENT|does not exist|mailbox.*unavailable/i;
const CONFLICT_PATTERN = /ambiguous|conflict|multiple matches|exists/i;
const NETWORK_PATTERN =
  /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ECONNRESET|network|timed out|connection (refused|closed|reset)|certificate|TLS|socket hang up|Bridge/i;

export function exitCodeForError(error: unknown): MailExitCodeValue {
  if (error instanceof CliError) {
    return error.exitCode as MailExitCodeValue;
  }

  const message = error instanceof Error ? error.message : String(error);
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code && networkCode(code)) {
    return MailExitCode.NETWORK;
  }

  if (AUTH_PATTERN.test(message)) return MailExitCode.AUTH;
  if (NOT_FOUND_PATTERN.test(message)) return MailExitCode.NOT_FOUND;
  if (CONFLICT_PATTERN.test(message)) return MailExitCode.CONFLICT;
  if (NETWORK_PATTERN.test(message)) return MailExitCode.NETWORK;

  return MailExitCode.USER;
}

export function cliErrorFromUnknown(
  error: unknown,
  fallbackCode = "error",
): CliError {
  if (error instanceof CliError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const exitCode = exitCodeForError(error);
  return new CliError(message, fallbackCode, exitCode);
}

function networkCode(code: string): boolean {
  return (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "EHOSTUNREACH" ||
    code === "ECONNRESET" ||
    code === "EPIPE"
  );
}
