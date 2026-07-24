import { MailExitCode, type MailExitCodeValue } from "./exit.ts";

export class CliError extends Error {
  readonly code: string;
  readonly exitCode: MailExitCodeValue;

  constructor(message: string, code = "error", exitCode: MailExitCodeValue = MailExitCode.USER) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof CliError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function errorCodeOf(error: unknown): string {
  if (error instanceof CliError) return error.code;
  return "error";
}

export function exitCodeOf(error: unknown): number {
  if (error instanceof CliError) return error.exitCode;
  // Lazy import avoided; keep mapping in exit-map for richer heuristics.
  return MailExitCode.USER;
}
