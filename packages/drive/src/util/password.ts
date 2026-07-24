import {
  resolvePassLogin,
  resolvePassRefFromEnv,
} from "@bkramer/proton-core";
import { CliError } from "./errors.ts";
import { ExitCode } from "./exit.ts";

const PASSWORD_ENV = "PROTON_PASSWORD";

export async function resolveAccountPassword(options: {
  passwordFlag?: string;
  passRef?: string;
}): Promise<string> {
  if (options.passwordFlag) {
    return options.passwordFlag;
  }

  const fromEnv = process.env[PASSWORD_ENV]?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const passRef =
    options.passRef?.trim() ||
    resolvePassRefFromEnv(undefined) ||
    process.env.PROTON_DRIVE_PASS?.trim();

  if (passRef) {
    const login = await resolvePassLogin(passRef);
    if (login.password) {
      return login.password;
    }
  }

  throw new CliError(
    "Account password required for encrypted Drive operations.\n" +
      "Set PROTON_PASSWORD, pass --password, or use --pass pass://Vault/Item.",
    ExitCode.ERROR,
  );
}
