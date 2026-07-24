import { emitError, wantsJson } from "./agent.ts";
import { ExitCode, type ExitCodeValue } from "./exit.ts";
import type { RefCandidate } from "./ref.ts";
import {
  API_CODE_APP_VERSION_BAD,
  API_CODE_HUMAN_VERIFICATION,
  API_CODE_MAILBOX_PASSWORD,
  API_CODE_PASSWORD_WRONG,
} from "../proton/types.ts";

export class CliError extends Error {
  readonly exitCode: ExitCodeValue;

  constructor(message: string, exitCode: ExitCodeValue = ExitCode.ERROR) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export class NotFoundError extends CliError {
  readonly kind: string;
  readonly ref: string;

  constructor(kind: string, ref: string) {
    super(ref ? `no ${kind} matching "${ref}"` : `no ${kind} found`, ExitCode.NOT_FOUND);
    this.name = "NotFoundError";
    this.kind = kind;
    this.ref = ref;
  }
}

export class AmbiguousError extends CliError {
  readonly kind: string;
  readonly ref: string;
  readonly candidates: RefCandidate[];

  constructor(kind: string, ref: string, candidates: RefCandidate[]) {
    const lines = candidates.map((candidate) => {
      if (candidate.label) {
        return `  ${candidate.id} ${candidate.label}`;
      }
      return `  ${candidate.id}`;
    });
    super(
      `ambiguous: ${candidates.length} ${kind}s match "${ref}":\n${lines.join("\n")}`,
      ExitCode.CONFLICT,
    );
    this.name = "AmbiguousError";
    this.kind = kind;
    this.ref = ref;
    this.candidates = candidates;
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
        "Update APP_VERSION in packages/contacts/src/proton/constants.ts."
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

export function reportCommandError(error: unknown): never {
  if (error instanceof AmbiguousError) {
    if (!wantsJson()) {
      for (const candidate of error.candidates) {
        const line = candidate.label
          ? `${candidate.id} ${candidate.label}`
          : candidate.id;
        process.stderr.write(`${line}\n`);
      }
    }
    emitError(error.message, error.exitCode, { candidates: error.candidates });
  } else if (error instanceof CliError) {
    emitError(error.message, error.exitCode);
  } else if (error instanceof Error) {
    emitError(error.message, ExitCode.ERROR);
  } else {
    emitError(String(error), ExitCode.ERROR);
  }
  throw error;
}
