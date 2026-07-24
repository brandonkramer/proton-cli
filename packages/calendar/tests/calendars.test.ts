import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Session } from "../src/proton/types.ts";
import { configureAgentFlags } from "../src/util/agent.ts";

const mockSession: Session = {
  Code: 1000,
  AccessToken: "access-token",
  RefreshToken: "refresh-token",
  TokenType: "Bearer",
  Scopes: ["full"],
  UID: "uid-1",
  UserID: "user-1",
  ExpiresIn: 3600,
};

const mockSavedSession = {
  session: mockSession,
  username: "alice",
  savedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

const mockUnlockCalendarKeys = mock(async () => ({
  userKeys: [{ ID: "uk-1", privateKey: {}, publicKey: {} }],
  addresses: [
    {
      ID: "addr-1",
      Email: "alice@proton.me",
      Keys: [{ ID: "ak-1", PrivateKey: "armored", Active: 1, Primary: 1 }],
    },
  ],
  addressKeys: new Map([
    [
      "addr-1",
      {
        addressId: "addr-1",
        email: "alice@proton.me",
        privateKey: {},
        publicKey: {},
      },
    ],
  ]),
}));

const mockGenerateCalendarKeyPayload = mock(async () => ({
  AddressID: "addr-1",
  PrivateKey: "cal-priv",
  Passphrase: { DataPacket: "dp", KeyPacket: "kp" },
  Signature: "sig",
}));

const mockUnlockPasswordScope = mock(async () => {});

mock.restore();

mock.module("../src/config/store.ts", () => ({
  loadSession: async () => mockSavedSession,
  saveSession: async () => {},
  clearSession: async () => {},
}));

mock.module("../src/proton/auth.ts", () => ({
  verifySession: async () => true,
  refreshSession: async (session: Session) => session,
  persistSession: async () => {},
}));

mock.module("../src/crypto/unlock.ts", () => ({
  unlockCalendarKeys: mockUnlockCalendarKeys,
  primaryAddressKey: (unlocked: {
    addressKeys: Map<string, { addressId: string; email: string; privateKey: unknown; publicKey: unknown }>;
    addresses: { ID: string; Email: string }[];
  }) => {
    const first = unlocked.addressKeys.values().next().value;
    if (!first) throw new Error("no keys");
    return first;
  },
}));

mock.module("../src/crypto/calendar-key.ts", () => ({
  generateCalendarKeyPayload: mockGenerateCalendarKeyPayload,
}));

mock.module("../src/crypto/password-scope.ts", () => ({
  unlockPasswordScope: mockUnlockPasswordScope,
}));

const {
  listCalendars,
  createCalendar,
  renameCalendar,
  deleteCalendar,
} = await import("../src/service/calendars.ts");

const { validateAccentColor } = await import("../src/util/colors.ts");

function mockFetch(routes: Record<string, (init?: RequestInit) => unknown>) {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const path = new URL(url).pathname;
    const handler = routes[path];
    if (!handler) {
      throw new Error(`unexpected fetch: ${path}`);
    }
    const body = handler(init);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

describe("validateAccentColor", () => {
  test("accepts Proton palette colors", () => {
    expect(validateAccentColor("#8080FF")).toBeNull();
    expect(validateAccentColor("#db60d6")).toBeNull();
  });

  test("rejects unknown colors", () => {
    expect(validateAccentColor("#FF0000")).toContain("invalid color");
  });
});

describe("calendar service", () => {
  afterAll(() => {
    mock.restore();
  });

  afterEach(() => {
    mockUnlockCalendarKeys.mockClear();
    mockGenerateCalendarKeyPayload.mockClear();
    mockUnlockPasswordScope.mockClear();
  });

  test("listCalendars maps member fields", async () => {
    const fetchImpl = mockFetch({
      "/calendar/v1": () => ({
        Code: 1000,
        Calendars: [
          {
            ID: "cal-1",
            Members: [
              {
                Name: "Work",
                Color: "#8080FF",
                Description: "desc",
                Email: "alice@proton.me",
                AddressID: "addr-1",
                ID: "mem-1",
              },
            ],
          },
        ],
      }),
    });

    const calendars = await listCalendars({
      session: mockSession,
      fetchImpl,
    });

    expect(calendars).toEqual([
      {
        id: "cal-1",
        name: "Work",
        color: "#8080FF",
        description: "desc",
        memberCount: 1,
      },
    ]);
  });

  test("createCalendar posts calendar and key setup", async () => {
    const calls: string[] = [];
    const fetchImpl = mockFetch({
      "/calendar/v1": (init) => {
        calls.push(`${init?.method ?? "GET"} /calendar/v1`);
        if (init?.method === "POST" && !init.body?.toString().includes("PrivateKey")) {
          return { Code: 1000, Calendar: { ID: "new-cal" } };
        }
        return { Code: 1000 };
      },
      "/calendar/v1/new-cal/keys": () => {
        calls.push("POST /calendar/v1/new-cal/keys");
        return { Code: 1000 };
      },
    });

    const id = await createCalendar({
      session: mockSession,
      name: "Work",
      color: "#8080FF",
      password: "secret",
      fetchImpl,
    });

    expect(id).toBe("new-cal");
    expect(mockUnlockCalendarKeys).toHaveBeenCalled();
    expect(mockGenerateCalendarKeyPayload).toHaveBeenCalled();
    expect(calls).toContain("POST /calendar/v1/new-cal/keys");
  });

  test("renameCalendar updates member settings", async () => {
    const fetchImpl = mockFetch({
      "/calendar/v1/cal-1/members": () => ({
        Code: 1000,
        Members: [{ ID: "mem-1", AddressID: "addr-1" }],
      }),
      "/calendar/v1/cal-1/members/mem-1": (init) => {
        expect(init?.method).toBe("PUT");
        const body = JSON.parse(String(init?.body));
        expect(body).toEqual({ Name: "Personal" });
        return { Code: 1000 };
      },
    });

    await renameCalendar({
      session: mockSession,
      calendarId: "cal-1",
      name: "Personal",
      password: "secret",
      fetchImpl,
    });
  });

  test("deleteCalendar unlocks password scope then deletes", async () => {
    const fetchImpl = mockFetch({
      "/calendar/v1/cal-1": (init) => {
        expect(init?.method).toBe("DELETE");
        return { Code: 1000 };
      },
    });

    await deleteCalendar({
      session: mockSession,
      calendarId: "cal-1",
      username: "alice",
      password: "secret",
      fetchImpl,
    });

    expect(mockUnlockPasswordScope).toHaveBeenCalledWith(
      expect.objectContaining({ username: "alice", password: "secret" }),
    );
  });
});

describe("calendars commands dry-run", () => {
  beforeEach(() => {
    configureAgentFlags({ json: true, dryRun: true, yes: false });
  });

  afterEach(() => {
    configureAgentFlags({ json: false, dryRun: false, yes: false });
  });

  test("create dry-run does not call service", async () => {
    const { runCalendarsCreate } = await import("../src/commands/calendars.ts");
    const chunks: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    await runCalendarsCreate({ name: "Work", color: "#8080FF" });

    process.stdout.write = orig;
    const output = JSON.parse(chunks.join(""));
    expect(output.ok).toBe(true);
    expect(output.dryRun).toBe(true);
    expect(output.action).toBe("create");
    expect(mockUnlockCalendarKeys).not.toHaveBeenCalled();
  });
});
