import {
  normalizePassItemRef,
  resolvePassLogin,
} from "@bkramer/proton-core";
import { readFile } from "node:fs/promises";
import type { MailConfig } from "./schema.ts";

export const PASSWORD_ENV = "PROTONMAIL_PASSWORD";
export const PASS_ENV = "PROTONMAIL_PASS";

export type PasswordSource = "env" | "pass" | "file" | "missing";

export interface PasswordStatus {
  source: PasswordSource;
  /** Human-safe detail (ref or path), never the secret value. */
  detail?: string;
  configured: boolean;
}

export function passwordStatusFromConfig(
  config: MailConfig | null,
): PasswordStatus {
  const envValue = process.env[PASSWORD_ENV]?.trim();
  if (envValue) {
    return {
      source: "env",
      detail: `$${PASSWORD_ENV}`,
      configured: true,
    };
  }

  const passEnv = process.env[PASS_ENV]?.trim();
  if (passEnv) {
    return {
      source: "pass",
      detail: normalizePassItemRef(passEnv),
      configured: true,
    };
  }

  if (config?.passwordPassRef?.trim()) {
    return {
      source: "pass",
      detail: normalizePassItemRef(config.passwordPassRef),
      configured: true,
    };
  }

  if (config?.passwordFile?.trim()) {
    return {
      source: "file",
      detail: config.passwordFile.trim(),
      configured: true,
    };
  }

  return { source: "missing", configured: false };
}

export async function resolveBridgePassword(
  config: MailConfig | null,
): Promise<string | null> {
  const envValue = process.env[PASSWORD_ENV]?.trim();
  if (envValue) {
    if (envValue.startsWith("pass://")) {
      const login = await resolvePassLogin(envValue);
      return login.password;
    }
    return envValue;
  }

  const passEnv = process.env[PASS_ENV]?.trim();
  if (passEnv) {
    const login = await resolvePassLogin(passEnv);
    return login.password;
  }

  if (config?.passwordPassRef?.trim()) {
    const login = await resolvePassLogin(config.passwordPassRef);
    return login.password;
  }

  if (config?.passwordFile?.trim()) {
    try {
      const value = (await readFile(config.passwordFile, "utf8")).trim();
      return value.length > 0 ? value : null;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new Error(
          `Bridge password file not found: ${config.passwordFile}\n` +
            "Fix the path in config or set PROTONMAIL_PASSWORD.",
        );
      }
      throw error;
    }
  }

  return null;
}

export function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret || secret.length < 2) continue;
    out = out.split(secret).join("[redacted]");
  }
  return out;
}
