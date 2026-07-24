import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Session } from "../src/proton/types.ts";
import { configureAgentFlags } from "../src/util/agent.ts";
import { attendeeToken } from "../src/util/ical.ts";

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

describe("respond helpers", () => {
  test("parseRespondStatus maps CLI words to API values", async () => {
    const { parseRespondStatus, ATTENDEE_STATUS, respondStatusLabel } = await import(
      "../src/service/respond.ts"
    );
    expect(parseRespondStatus("accept")).toBe(ATTENDEE_STATUS.ACCEPTED);
    expect(parseRespondStatus("Tentative")).toBe(ATTENDEE_STATUS.TENTATIVE);
    expect(parseRespondStatus("decline")).toBe(ATTENDEE_STATUS.DECLINED);
    expect(respondStatusLabel(ATTENDEE_STATUS.ACCEPTED)).toBe("accepted");
    expect(respondStatusLabel(ATTENDEE_STATUS.TENTATIVE)).toBe("tentatively accepted");
    expect(respondStatusLabel(ATTENDEE_STATUS.DECLINED)).toBe("declined");
    expect(() => parseRespondStatus("maybe")).toThrow(/invalid --status/);
  });
});

describe("respond service", () => {
  test("respondToEvent updates attendee partstat", async () => {
    const uid = "invite-uid@proton.me";
    const selfEmail = "alice@proton.me";
    const token = attendeeToken(uid, selfEmail);
    const putCalls: { path: string; body: unknown }[] = [];

    const fetchImpl = mockFetch({
      "/calendar/v1/cal-1/events/ev-1": () => ({
        Code: 1000,
        Event: {
          ID: "ev-1",
          UID: uid,
          IsOrganizer: 0,
          AttendeesInfo: {
            Attendees: [{ ID: "att-1", Token: token, Status: 0 }],
            MoreAttendees: 0,
          },
        },
      }),
      "/core/v4/addresses": () => ({
        Code: 1000,
        Addresses: [{ Email: selfEmail }],
      }),
      "/calendar/v1/cal-1/events/ev-1/attendees/att-1": (init) => {
        putCalls.push({
          path: "/calendar/v1/cal-1/events/ev-1/attendees/att-1",
          body: JSON.parse(String(init?.body)),
        });
        return { Code: 1000 };
      },
    });

    const { respondToEvent, ATTENDEE_STATUS } = await import("../src/service/respond.ts");
    const result = await respondToEvent({
      session: mockSession,
      calendarId: "cal-1",
      eventId: "ev-1",
      status: ATTENDEE_STATUS.ACCEPTED,
      fetchImpl,
    });

    expect(result.status).toBe("accepted");
    expect(result.attendeeId).toBe("att-1");
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]?.body).toMatchObject({ Status: ATTENDEE_STATUS.ACCEPTED });
    expect(typeof (putCalls[0]?.body as { UpdateTime: number }).UpdateTime).toBe("number");
  });

  test("respondToEvent supports tentative and decline", async () => {
    const uid = "invite-uid@proton.me";
    const selfEmail = "alice@proton.me";
    const token = attendeeToken(uid, selfEmail);
    const statuses: number[] = [];

    const fetchImpl = mockFetch({
      "/calendar/v1/cal-1/events/ev-2": () => ({
        Code: 1000,
        Event: {
          ID: "ev-2",
          UID: uid,
          IsOrganizer: 0,
          AttendeesInfo: {
            Attendees: [{ ID: "att-2", Token: token, Status: 0 }],
          },
        },
      }),
      "/core/v4/addresses": () => ({
        Code: 1000,
        Addresses: [{ Email: selfEmail }],
      }),
      "/calendar/v1/cal-1/events/ev-2/attendees/att-2": (init) => {
        statuses.push(JSON.parse(String(init?.body)).Status);
        return { Code: 1000 };
      },
    });

    const { respondToEvent, ATTENDEE_STATUS } = await import("../src/service/respond.ts");

    await respondToEvent({
      session: mockSession,
      calendarId: "cal-1",
      eventId: "ev-2",
      status: ATTENDEE_STATUS.TENTATIVE,
      fetchImpl,
    });
    await respondToEvent({
      session: mockSession,
      calendarId: "cal-1",
      eventId: "ev-2",
      status: ATTENDEE_STATUS.DECLINED,
      fetchImpl,
    });

    expect(statuses).toEqual([ATTENDEE_STATUS.TENTATIVE, ATTENDEE_STATUS.DECLINED]);
  });

  test("respondToEvent rejects organizer events", async () => {
    const fetchImpl = mockFetch({
      "/calendar/v1/cal-1/events/ev-3": () => ({
        Code: 1000,
        Event: {
          ID: "ev-3",
          UID: "uid-3",
          IsOrganizer: 1,
          AttendeesInfo: { Attendees: [] },
        },
      }),
    });

    const { respondToEvent, ATTENDEE_STATUS } = await import("../src/service/respond.ts");
    await expect(
      respondToEvent({
        session: mockSession,
        calendarId: "cal-1",
        eventId: "ev-3",
        status: ATTENDEE_STATUS.ACCEPTED,
        fetchImpl,
      }),
    ).rejects.toThrow(/organizer/);
  });

  test("respondToEvent walks paginated attendees", async () => {
    const uid = "invite-uid@proton.me";
    const selfEmail = "alice@proton.me";
    const token = attendeeToken(uid, selfEmail);

    const fetchImpl = mockFetch({
      "/calendar/v1/cal-1/events/ev-4": () => ({
        Code: 1000,
        Event: {
          ID: "ev-4",
          UID: uid,
          IsOrganizer: 0,
          AttendeesInfo: {
            Attendees: [{ ID: "att-other", Token: "other-token", Status: 0 }],
            MoreAttendees: 1,
          },
        },
      }),
      "/core/v4/addresses": () => ({
        Code: 1000,
        Addresses: [{ Email: selfEmail }],
      }),
      "/calendar/v1/cal-1/events/ev-4/attendees": () => ({
        Code: 1000,
        Attendees: [{ ID: "att-self", Token: token, Status: 0 }],
        MoreAttendees: 0,
      }),
      "/calendar/v1/cal-1/events/ev-4/attendees/att-self": () => ({ Code: 1000 }),
    });

    const { respondToEvent, ATTENDEE_STATUS } = await import("../src/service/respond.ts");
    const result = await respondToEvent({
      session: mockSession,
      calendarId: "cal-1",
      eventId: "ev-4",
      status: ATTENDEE_STATUS.ACCEPTED,
      fetchImpl,
    });

    expect(result.attendeeId).toBe("att-self");
  });
});

describe("respond command dry-run", () => {
  const mockSavedSession = {
    session: mockSession,
    username: "alice",
    savedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };

  beforeEach(() => {
    configureAgentFlags({ json: true, dryRun: true, yes: false });
  });

  afterEach(() => {
    configureAgentFlags({ json: false, dryRun: false, yes: false });
  });

  test("respond dry-run does not call partstat API", async () => {
    mock.module("../src/config/store.ts", () => ({
      loadSession: async () => mockSavedSession,
      saveSession: async () => {},
      clearSession: async () => {},
    }));
    mock.module("../src/proton/auth.ts", () => ({
      verifySession: async () => true,
    }));
    mock.module("../src/service/events.ts", () => ({
      resolveEventRef: async () => ({ calendarId: "cal-1", eventId: "ev-1" }),
    }));

    const putMock = mock(async () => {});
    mock.module("../src/service/respond.ts", () => ({
      parseRespondStatus: (s: string) => (s === "accept" ? 3 : 0),
      respondToEvent: putMock,
    }));

    const { runEventsRespond } = await import("../src/commands/events.ts");
    const chunks: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    await runEventsRespond(["cal-1", "ev-1"], { status: "accept" });

    process.stdout.write = orig;
    const output = JSON.parse(chunks.join(""));
    expect(output.ok).toBe(true);
    expect(output.dryRun).toBe(true);
    expect(output.action).toBe("respond");
    expect(output.status).toBe("accept");
    expect(putMock).not.toHaveBeenCalled();
  });
});
