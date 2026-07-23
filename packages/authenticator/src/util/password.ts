import {
  PASSWORD_ENV,
  passwordFromEnv,
  resolvePassLogin,
  resolvePassRefFromEnv,
  resolvePassTotp,
  totpFromEnv,
  usernameFromEnv,
} from "../pass/credentials.ts";
import { preferNonInteractive } from "./agent.ts";
import { CliError } from "./errors.ts";

export async function resolveAccountPassword(options: {
  passRef?: string;
  promptHint?: string;
}): Promise<string> {
  const fromEnv = passwordFromEnv();
  if (fromEnv) return fromEnv;

  const passRef = resolvePassRefFromEnv(options.passRef);
  if (passRef) {
    const login = await resolvePassLogin(passRef);
    return login.password;
  }

  if (preferNonInteractive()) {
    throw new CliError(
      `Password required in non-interactive mode.\n` +
        `Set $${PASSWORD_ENV} (or pass:// via pass-cli run), or pass --pass <ref>.`,
      "password_required",
    );
  }

  const { inkPromptPassword } = await import("../ui/prompts.tsx");
  return inkPromptPassword("Proton password", {
    hint:
      options.promptHint ??
      `Account password (Single Password Mode). Prefer Pass: export ${PASSWORD_ENV}='pass://…' && pass-cli run -- protonauth …`,
  });
}

export async function resolveLoginIdentity(options: {
  usernameArg?: string;
  passRef?: string;
}): Promise<{ username?: string; password?: string; passRef?: string }> {
  const passRef = resolvePassRefFromEnv(options.passRef);
  if (passRef) {
    const login = await resolvePassLogin(passRef);
    return {
      username: options.usernameArg?.trim() || login.username,
      password: login.password,
      passRef,
    };
  }

  const fromEnvPassword = passwordFromEnv();
  const fromEnvUser =
    options.usernameArg?.trim() || usernameFromEnv() || undefined;

  if (fromEnvPassword) {
    return { username: fromEnvUser, password: fromEnvPassword };
  }

  return { username: fromEnvUser, passRef: undefined };
}

export async function resolveUsernameInteractive(
  existing?: string,
): Promise<string> {
  if (existing?.trim()) return existing.trim();

  if (preferNonInteractive()) {
    throw new CliError(
      "Username required in non-interactive mode.\n" +
        "Pass a username argument, set $PROTON_USERNAME, or use --pass.",
      "username_required",
    );
  }

  const { inkPromptText } = await import("../ui/prompts.tsx");
  return inkPromptText("Username or email", {
    placeholder: "you@proton.me",
    hint: "Email is fine — the domain will be stripped for Proton SRP.",
  });
}

export async function resolveTotpCode(options: {
  passRef?: string;
  required: boolean;
}): Promise<string | undefined> {
  if (!options.required) {
    return totpFromEnv();
  }

  const fromEnv = totpFromEnv();
  if (fromEnv) return fromEnv;

  if (options.passRef) {
    const fromPass = await resolvePassTotp(options.passRef);
    if (fromPass) return fromPass;
  }

  if (preferNonInteractive()) {
    throw new CliError(
      "2FA TOTP required in non-interactive mode.\n" +
        "Set $PROTON_TOTP (or pass://…/totp via pass-cli run), or sign in interactively once.",
      "totp_required",
    );
  }

  const { inkPromptTotp } = await import("../ui/prompts.tsx");
  return inkPromptTotp();
}
