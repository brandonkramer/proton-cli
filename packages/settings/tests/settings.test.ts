import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Session } from "../src/proton/types.ts";
import { configureAgentFlags } from "../src/util/agent.ts";

const mockSession: Session = {
  Code: 1000,
  AccessToken: "access-token-secret",
  RefreshToken: "refresh-token-secret",
  TokenType: "Bearer",
  Scopes: ["full"],
  UID: "uid-1",
  UserID: "user-1",
  ExpiresIn: 3600,
};

const mockSavedSession = {
  session: mockSession,
  username: "alice@example.com",
  savedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

const fetchCalls: Array<{ path: string; method: string; body?: unknown }> = [];

const accountPayload = {
  Code: 1000,
  UserSettings: {
    Locale: "en_US",
    Telemetry: 1,
    CrashReports: 0,
    Email: { Value: "recovery@example.com" },
    Phone: { Value: "+15551234567" },
    HighSecurity: { Value: 0 },
  },
};

const mailPayload = {
  Code: 1000,
  MailSettings: {
    DisplayName: "Alice",
    PageSize: 50,
    ViewMode: 1,
    DraftMIMEType: "text/html",
    PMSignature: 1,
    AutoSaveContacts: 1,
    HideRemoteImages: 0,
    Sign: 0,
    AttachPublicKey: 0,
    Shortcuts: 1,
    DelaySendSeconds: 10,
  },
};

const mockFetch = mock(async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  const path = url.replace("https://mail-api.proton.me", "");
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  fetchCalls.push({ path, method, body });

  if (path === "/core/v4/settings" && method === "GET") {
    return new Response(JSON.stringify(accountPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (path === "/core/v4/users" && method === "GET") {
    return new Response(JSON.stringify({ Code: 1000 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (path === "/mail/v4/settings" && method === "GET") {
    return new Response(JSON.stringify(mailPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (path === "/mail/v4/settings/viewmode" && method === "PUT") {
    return new Response(JSON.stringify({ Code: 1000 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ Code: 9999, Error: "unexpected path" }), {
    status: 404,
  });
});

mock.module("../src/config/store.ts", () => ({
  loadSession: async () => mockSavedSession,
  saveSession: async () => {},
  clearSession: async () => {},
  clearSettingsState: async () => {},
}));

mock.module("../src/proton/auth.ts", () => ({
  verifySession: async () => true,
  refreshSession: async (session: Session) => session,
  persistSession: async () => {},
}));

mock.module("../src/proton/auth.ts", () => ({
  verifySession: async () => true,
  refreshSession: async (session: Session) => session,
  persistSession: async () => {},
}));

const {
  getAccountSettings,
  getMailSettings,
  updateMailSetting,
  requireSettingsRuntime,
} = await import("../src/settings/client.ts");

const { formatAccountSettings, formatMailSettings } = await import(
  "../src/settings/format.ts"
);

const mockFetchImpl = mockFetch as unknown as typeof fetch;

describe("settings API client", () => {
  beforeEach(() => {
    fetchCalls.length = 0;
    mockFetch.mockClear();
  });

  test("getAccountSettings fetches /core/v4/settings", async () => {
    const runtime = await requireSettingsRuntime(mockFetchImpl);
    const data = await getAccountSettings(runtime);
    expect(data.UserSettings).toBeDefined();
    expect(fetchCalls).toEqual([
      { path: "/core/v4/settings", method: "GET", body: undefined },
    ]);
  });

  test("getMailSettings fetches /mail/v4/settings", async () => {
    const runtime = await requireSettingsRuntime(mockFetchImpl);
    const data = await getMailSettings(runtime);
    expect(data.MailSettings).toBeDefined();
    expect(fetchCalls[0]?.path).toBe("/mail/v4/settings");
  });

  test("updateMailSetting PUTs view-mode to /mail/v4/settings/viewmode", async () => {
    const runtime = await requireSettingsRuntime(mockFetchImpl);
    const result = await updateMailSetting(runtime, "view-mode", "0");
    expect(result).toEqual({
      key: "view-mode",
      value: "0",
      path: "/mail/v4/settings/viewmode",
    });
    expect(fetchCalls).toEqual([
      {
        path: "/mail/v4/settings/viewmode",
        method: "PUT",
        body: { ViewMode: 0 },
      },
    ]);
  });

  test("updateMailSetting rejects unknown key", async () => {
    const runtime = await requireSettingsRuntime(mockFetchImpl);
    await expect(updateMailSetting(runtime, "not-a-key", "1")).rejects.toThrow(
      /unknown setting/,
    );
    expect(fetchCalls).toHaveLength(0);
  });

  test("updateMailSetting rejects non-integer for integer keys", async () => {
    const runtime = await requireSettingsRuntime(mockFetchImpl);
    await expect(updateMailSetting(runtime, "view-mode", "abc")).rejects.toThrow(
      /integer value/,
    );
  });
});

describe("mail setting value parsing", () => {
  test("parseMailSettingValue rejects out-of-range view-mode", async () => {
    const { parseMailSettingValue } = await import("../src/settings/keys.ts");
    expect(() => parseMailSettingValue("view-mode", "2")).toThrow(
      /0 \(conversations\) or 1 \(messages\)/,
    );
  });

  test("parseMailSettingValue rejects out-of-range delay-send", async () => {
    const { parseMailSettingValue } = await import("../src/settings/keys.ts");
    expect(() => parseMailSettingValue("delay-send", "21")).toThrow(/0–20/);
  });
});

describe("settings formatters", () => {
  test("formatAccountSettings renders locale and recovery fields", () => {
    const text = formatAccountSettings(accountPayload);
    expect(text).toContain("Locale:");
    expect(text).toContain("en_US");
    expect(text).toContain("Recovery Email:");
    expect(text).not.toContain("access-token-secret");
  });

  test("formatMailSettings renders display name and view mode", () => {
    const text = formatMailSettings(mailPayload);
    expect(text).toContain("Display Name:");
    expect(text).toContain("Alice");
    expect(text).toContain("View Mode:");
    expect(text).toContain("messages");
  });
});

describe("settings commands (agent output)", () => {
  afterEach(() => {
    configureAgentFlags({ json: false, yes: false, dryRun: false });
  });

  test("stringifySettingsOutput strips tokens from JSON get payload", async () => {
    const { stringifySettingsOutput } = await import("../src/util/secrets.ts");
    const runtime = await requireSettingsRuntime(mockFetchImpl);
    const data = await getAccountSettings(runtime);
    const output = stringifySettingsOutput({ ...data, session: mockSession });
    expect(output).not.toContain("access-token-secret");
    expect(output).not.toContain("refresh-token-secret");
    expect(output).toContain("UserSettings");
  });
});

describe("settings set dry-run", () => {
  afterEach(() => {
    configureAgentFlags({ json: false, yes: false, dryRun: false });
  });

  test("dry-run skips PUT", async () => {
    configureAgentFlags({ json: true, yes: true, dryRun: true });
    const { registerSetCommand } = await import("../src/commands/set.ts");
    const { Command } = await import("commander");

    fetchCalls.length = 0;

    const root = new Command();
    const settings = root.command("settings");
    settings.option("--json", "json");
    settings.hook("preAction", (_thisCommand, actionCommand) => {
      const local = actionCommand.opts() as { dryRun?: boolean };
      configureAgentFlags({
        json: true,
        yes: true,
        dryRun: Boolean(local.dryRun),
      });
    });
    registerSetCommand(settings);

    const stdout: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      await root.parseAsync(["node", "test", "settings", "set", "view-mode", "1", "--dry-run"], {
        from: "node",
      });
    } finally {
      process.stdout.write = original;
    }

    expect(fetchCalls).toHaveLength(0);
    const payload = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(payload.ok).toBe(true);
    expect(payload.dryRun).toBe(true);
    expect(payload.key).toBe("view-mode");
  });
});
