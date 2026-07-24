import { describe, expect, test } from "bun:test";
import type { Session } from "../src/proton/types.ts";
import {
  formatSettingsStatus,
  redactKnownSecrets,
  sanitizeForOutput,
  stringifySettingsOutput,
} from "../src/util/secrets.ts";

describe("secret-safe settings output", () => {
  const password = "super-secret-password-xyz";
  const accessToken = "access-token-abc123";
  const refreshToken = "refresh-token-def456";

  test("sanitizeForOutput redacts session tokens", () => {
    const session: Session = {
      Code: 1000,
      AccessToken: accessToken,
      RefreshToken: refreshToken,
      TokenType: "Bearer",
      Scopes: ["full"],
      UID: "uid-1",
      UserID: "user-1",
      ExpiresIn: 3600,
    };

    const sanitized = sanitizeForOutput({ session, username: "alice" }) as {
      session: Session;
    };

    expect(sanitized.session.AccessToken).toBe("[redacted]");
    expect(sanitized.session.RefreshToken).toBe("[redacted]");
    expect(JSON.stringify(sanitized)).not.toContain(accessToken);
    expect(JSON.stringify(sanitized)).not.toContain(refreshToken);
  });

  test("stringifySettingsOutput strips env secrets from nested values", () => {
    const output = stringifySettingsOutput(
      {
        Settings: { ViewMode: 1, Note: `pwd=${password}` },
        session: { AccessToken: accessToken },
      },
      [password, accessToken],
    );

    expect(output).not.toContain(password);
    expect(output).not.toContain(accessToken);
    expect(output).toContain("[redacted]");
  });

  test("redactKnownSecrets removes bearer tokens and otpauth URIs", () => {
    const text = redactKnownSecrets(
      `Authorization: Bearer ${accessToken}\notpauth://totp/Proton?secret=ABC`,
      [accessToken],
    );

    expect(text).not.toContain(accessToken);
    expect(text).toContain("Bearer [redacted]");
    expect(text).toContain("[redacted-otpauth]");
  });

  test("formatSettingsStatus never includes token substrings", () => {
    const status = formatSettingsStatus({
      signedIn: true,
      username: "alice@example.com",
      expiresAt: "2026-07-24T12:00:00.000Z",
      configDir: `/tmp/proton/settings`,
      extraSecrets: [password, accessToken, refreshToken],
    });

    expect(status).not.toContain(password);
    expect(status).not.toContain(accessToken);
    expect(status).not.toContain(refreshToken);
    expect(status).toContain("Signed in as alice@example.com");
  });
});
