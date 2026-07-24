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

const mockUnlockCalendarForEvents = mock(async () => ({
  calendarPrivateKey: {},
  addressPrivateKey: {},
  addressPublicKey: {},
  memberId: "mem-1",
  email: "alice@proton.me",
}));

const mockDecryptCards = mock(async () => ["SUMMARY:Meeting\r\nLOCATION:Vienna\r\n"]);

const mockEncryptAndSignCardSplit = mock(async () => ({
  signedCard: { Type: 2, Data: "signed", Signature: "sig" },
  encryptedCard: { Type: 3, Data: "enc", Signature: "sig2" },
  sharedKeyPacket: "key-packet",
  sessionKey: { data: new Uint8Array([1, 2, 3]), algorithm: "aes256" },
}));

const mockEncryptPartWithSessionKey = mock(async () => ({
  Type: 3,
  Data: "attendees",
  Signature: "sig3",
}));

const mockEncryptSessionKeyForRecipient = mock(async () => "addr-key-packet");

mock.restore();

mock.module("../src/config/store.ts", () => ({
  loadSession: async () => mockSavedSession,
  saveSession: async () => {},
  clearSession: async () => {},
}));

mock.module("../src/proton/auth.ts", () => ({
  verifySession: async () => true,
}));

mock.module("../src/crypto/calendar-unlock.ts", () => ({
  unlockCalendarForEvents: mockUnlockCalendarForEvents,
}));

mock.module("../src/crypto/event-card.ts", () => ({
  cardFromRaw: (raw: Record<string, unknown>) => ({
    Type: Number(raw.Type ?? 0),
    Data: String(raw.Data ?? ""),
    Signature: raw.Signature ? String(raw.Signature) : undefined,
  }),
  decryptCards: mockDecryptCards,
  encryptAndSignCardSplit: mockEncryptAndSignCardSplit,
  encryptPartWithSessionKey: mockEncryptPartWithSessionKey,
  encryptSessionKeyForRecipient: mockEncryptSessionKeyForRecipient,
}));

mock.module("../src/crypto/proxy.ts", () => ({
  getCalendarCrypto: async () => ({
    importPublicKey: async () => ({}),
  }),
}));

const {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
} = await import("../src/service/events.ts");

const { parseDuration } = await import("../src/util/duration.ts");
const { icalField, parseTime, icalTrigger } = await import("../src/util/ical.ts");

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

describe("duration + ical helpers", () => {
  test("parseDuration accepts common units", () => {
    expect(parseDuration("15m")).toBe(900_000);
    expect(parseDuration("1h")).toBe(3_600_000);
    expect(parseDuration("1d")).toBe(86_400_000);
  });

  test("icalTrigger converts reminder durations", () => {
    expect(icalTrigger(parseDuration("15m"))).toBe("-PT15M");
    expect(icalTrigger(parseDuration("1h"))).toBe("-PT1H");
    expect(icalTrigger(parseDuration("1d"))).toBe("-P1D");
  });

  test("parseTime accepts local datetime", () => {
    const parsed = parseTime("2026-04-16T14:00");
    expect(parsed.getHours()).toBe(14);
  });

  test("icalField extracts SUMMARY", () => {
    expect(icalField("SUMMARY:Meeting\r\nLOCATION:Vienna", "SUMMARY")).toBe("Meeting");
  });
});

describe("events service", () => {
  afterAll(() => {
    mock.restore();
  });

  afterEach(() => {
    mockUnlockCalendarForEvents.mockClear();
    mockDecryptCards.mockClear();
    mockEncryptAndSignCardSplit.mockClear();
  });

  test("listEvents decrypts shared cards", async () => {
    const fetchImpl = mockFetch({
      "/calendar/v1/cal-1/events": () => ({
        Code: 1000,
        Events: [
          {
            ID: "ev-1",
            CalendarID: "cal-1",
            StartTime: 1713276000,
            EndTime: 1713279600,
            FullDay: 0,
            UID: "uid-1",
            SharedKeyPacket: "packet",
            SharedEvents: [{ Type: 3, Data: "enc", Signature: "sig" }],
          },
        ],
      }),
    });

    const events = await listEvents({
      session: mockSession,
      calendarId: "cal-1",
      password: "secret",
      fetchImpl,
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Meeting");
    expect(events[0]?.location).toBe("Vienna");
    expect(mockUnlockCalendarForEvents).toHaveBeenCalled();
    expect(mockDecryptCards).toHaveBeenCalled();
  });

  test("getEvent loads one event", async () => {
    const fetchImpl = mockFetch({
      "/calendar/v1/cal-1/events/ev-1": () => ({
        Code: 1000,
        Event: {
          ID: "ev-1",
          CalendarID: "cal-1",
          StartTime: 1713276000,
          EndTime: 1713279600,
          FullDay: 0,
          UID: "uid-1",
          SharedKeyPacket: "packet",
          SharedEvents: [{ Type: 3, Data: "enc", Signature: "sig" }],
        },
      }),
    });

    const event = await getEvent({
      session: mockSession,
      calendarId: "cal-1",
      eventId: "ev-1",
      password: "secret",
      fetchImpl,
    });

    expect(event.id).toBe("ev-1");
    expect(event.title).toBe("Meeting");
  });

  test("createEvent syncs encrypted payload", async () => {
    const calls: string[] = [];
    const fetchImpl = mockFetch({
      "/calendar/v1/cal-1/events/sync": (init) => {
        calls.push(String(init?.method));
        const body = JSON.parse(String(init?.body));
        expect(body.MemberID).toBe("mem-1");
        expect(body.Events[0].Event.SharedKeyPacket).toBe("key-packet");
        return {
          Code: 1000,
          Responses: [{ Response: { Event: { ID: "new-ev" } } }],
        };
      },
    });

    const result = await createEvent({
      session: mockSession,
      calendarId: "cal-1",
      password: "secret",
      fetchImpl,
      input: {
        title: "Standup",
        start: new Date("2026-04-16T09:00:00"),
        end: new Date("2026-04-16T09:30:00"),
        reminders: ["15m"],
        rrule: "FREQ=WEEKLY;COUNT=10",
      },
    });

    expect(result.id).toBe("new-ev");
    expect(calls).toEqual(["PUT"]);
    expect(mockEncryptAndSignCardSplit).toHaveBeenCalled();
  });

  test("updateEvent reuses shared key packet", async () => {
    const fetchImpl = mockFetch({
      "/calendar/v1/cal-1/events/ev-1": () => ({
        Code: 1000,
        Event: {
          ID: "ev-1",
          CalendarID: "cal-1",
          StartTime: 1713276000,
          EndTime: 1713279600,
          FullDay: 0,
          UID: "uid-1",
          SharedKeyPacket: "existing-packet",
          SharedEvents: [{ Type: 3, Data: "enc", Signature: "sig" }],
        },
      }),
      "/calendar/v1/cal-1/events/sync": (init) => {
        expect(init?.method).toBe("PUT");
        return { Code: 1000 };
      },
    });

    await updateEvent({
      session: mockSession,
      calendarId: "cal-1",
      eventId: "ev-1",
      password: "secret",
      title: "Updated",
      fetchImpl,
    });

    expect(mockEncryptAndSignCardSplit).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.anything(),
      expect.anything(),
      "existing-packet",
    );
  });

  test("deleteEvent syncs delete payload", async () => {
    const fetchImpl = mockFetch({
      "/calendar/v1/cal-1/events/sync": (init) => {
        expect(init?.method).toBe("PUT");
        const body = JSON.parse(String(init?.body));
        expect(body.Events).toEqual([{ ID: "ev-1" }]);
        return { Code: 1000 };
      },
    });

    await deleteEvent({
      session: mockSession,
      calendarId: "cal-1",
      eventId: "ev-1",
      password: "secret",
      fetchImpl,
    });
  });
});

describe("events commands dry-run", () => {
  beforeEach(() => {
    configureAgentFlags({ json: true, dryRun: true, yes: false });
  });

  afterEach(() => {
    configureAgentFlags({ json: false, dryRun: false, yes: false });
  });

  test("create dry-run does not call service", async () => {
    const { runEventsCreate } = await import("../src/commands/events.ts");
    const chunks: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    await runEventsCreate({
      title: "Meeting",
      start: "2026-04-16T14:00",
      duration: "1h",
    });

    process.stdout.write = orig;
    const output = JSON.parse(chunks.join(""));
    expect(output.ok).toBe(true);
    expect(output.dryRun).toBe(true);
    expect(output.action).toBe("create");
    expect(mockEncryptAndSignCardSplit).not.toHaveBeenCalled();
  });
});
