import {
  resolvePassLogin,
  resolvePassRefFromEnv,
} from "@bkramer/proton-core";
import { isNonInteractive } from "./agent.ts";
import { CliError } from "./errors.ts";
import { ExitCode } from "./exit.ts";

const PASSWORD_ENV = "PROTON_PASSWORD";

export function passwordFromEnv(): string | undefined {
  const value = process.env[PASSWORD_ENV]?.trim();
  return value || undefined;
}

export async function resolveAccountPassword(options: {
  passRef?: string;
} = {}): Promise<string> {
  const fromEnv = passwordFromEnv();
  if (fromEnv) return fromEnv;

  const passRef = resolvePassRefFromEnv(options.passRef);
  if (passRef) {
    const login = await resolvePassLogin(passRef);
    return login.password;
  }

  if (isNonInteractive()) {
    throw new CliError(
      `Password required in non-interactive mode.\n` +
        `Set $${PASSWORD_ENV} (or pass:// via pass-cli run), or pass --pass <ref>.`,
      ExitCode.ERROR,
    );
  }

  throw new CliError(
    "Interactive password prompt is not implemented for contacts yet.\n" +
      `Sign in with \`proton signin\` and set $${PASSWORD_ENV} or PROTON_PASS.`,
    ExitCode.ERROR,
  );
}
