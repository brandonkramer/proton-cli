import {
  API_CODE_APP_VERSION_BAD,
  API_CODE_HUMAN_VERIFICATION,
  API_CODE_MAILBOX_PASSWORD,
  API_CODE_PASSWORD_WRONG,
} from "../proton/types.ts";

export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

export function messageForApiCode(code: number, fallback?: string): string {
  switch (code) {
    case API_CODE_PASSWORD_WRONG:
      return "Authentication failed. Check your username and password.";
    case API_CODE_HUMAN_VERIFICATION:
      return (
        "CAPTCHA / human verification required.\n" +
        "Sign in once at https://account.proton.me from this network, then retry."
      );
    case API_CODE_APP_VERSION_BAD:
      return (
        "Proton rejected this CLI app version header (5003).\n" +
        "Update APP_VERSION in packages/settings/src/proton/constants.ts."
      );
    case API_CODE_MAILBOX_PASSWORD:
      return (
        "This account uses legacy two-password mode, which is not supported.\n" +
        "Switch to one-password mode at account.proton.me → Account and password."
      );
    default:
      return fallback ?? `Proton API error (code ${code}).`;
  }
}
