/** JSON field names that must never appear in user-facing output. */
const SECRET_FIELD_NAMES = new Set([
  "AccessToken",
  "RefreshToken",
  "Password",
  "Salt",
  "Modulus",
  "ServerEphemeral",
  "ClientEphemeral",
  "ClientProof",
  "ServerProof",
  "SRPSession",
  "PrivateKey",
  "Passphrase",
  "KeyPassword",
  "KeySalt",
]);

const BEARER_PATTERN = /Bearer\s+\S+/gi;
const OTPAUTH_PATTERN = /otpauth:\/\/[^\s]+/gi;

/** Replace known secret substrings and common token patterns in text. */
export function redactKnownSecrets(
  text: string,
  secrets: readonly string[],
): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= 4) {
      out = out.split(secret).join("[redacted]");
    }
  }
  return out
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(OTPAUTH_PATTERN, "[redacted-otpauth]");
}

/** Recursively strip sensitive keys before JSON/text output (get/status). */
export function sanitizeForOutput(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForOutput(item));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_FIELD_NAMES.has(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = sanitizeForOutput(nested);
    }
    return out;
  }
  return value;
}

export function formatSettingsStatus(options: {
  signedIn: boolean;
  username?: string;
  expiresAt?: string;
  configDir: string;
  extraSecrets?: readonly string[];
}): string {
  const lines = [
    options.signedIn
      ? `Signed in as ${options.username ?? "(unknown)"}`
      : "Not signed in — use proton signin --products settings",
    options.expiresAt ? `Session expires: ${options.expiresAt}` : "Session: none",
    `Config: ${options.configDir}`,
  ];
  return redactKnownSecrets(lines.join("\n"), options.extraSecrets ?? []);
}

/** Stringify settings payload safely for CLI or logs. */
export function stringifySettingsOutput(
  value: unknown,
  secrets: readonly string[] = [],
): string {
  const sanitized = sanitizeForOutput(value);
  const json = JSON.stringify(sanitized, null, 2);
  return redactKnownSecrets(json, secrets);
}
