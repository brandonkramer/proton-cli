import {
  API_CODE_APP_VERSION_BAD,
  API_CODE_HUMAN_VERIFICATION,
  API_CODE_MAILBOX_PASSWORD,
  API_CODE_PASSWORD_WRONG,
  API_CODE_SCOPE,
} from "../proton/types.ts";

export class CliError extends Error {
  /** Stable machine-readable code for agents (`captcha_required`, …). */
  readonly code: string;

  constructor(message: string, code = "error") {
    super(message);
    this.name = "CliError";
    this.code = code;
  }
}

export function messageForApiCode(code: number, fallback?: string): string {
  switch (code) {
    case API_CODE_PASSWORD_WRONG:
      return "Authentication failed. Check your username and password.";
    case API_CODE_HUMAN_VERIFICATION:
      return (
        "CAPTCHA / human verification required.\n" +
        "Re-run signin interactively — the CLI opens a native CAPTCHA window."
      );
    case API_CODE_APP_VERSION_BAD:
    case 5002:
      return (
        "Proton rejected this CLI app version header.\n" +
        "Update appVersionHeader() in src/proton/constants.ts."
      );
    case 2064:
      return (
        "Proton rejected the appversion product id.\n" +
        "Update appVersionHeader() in src/proton/constants.ts."
      );
    case API_CODE_MAILBOX_PASSWORD:
      return (
        "This account uses legacy two-password mode, which is not supported.\n" +
        "Switch to one-password mode at account.proton.me → Account and password."
      );
    case API_CODE_SCOPE:
      return "Required scope missing from session. Sign out and sign in again.";
    default:
      return fallback ?? `Proton API error (code ${code}).`;
  }
}

/** Redact values that must never appear in logs or error dumps. */
export function safeErrorMessage(error: unknown): string {
  if (error instanceof CliError) return error.message;
  if (error instanceof Error) {
    return error.message
      .replace(/otpauth:\/\/[^\s]+/gi, "[redacted-otpauth]")
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  }
  return String(error);
}

export function errorCodeOf(error: unknown): string {
  if (error instanceof CliError) return error.code;
  return "error";
}
