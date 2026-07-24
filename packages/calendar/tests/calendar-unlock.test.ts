import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Session } from "../src/proton/types.ts";

// Isolate from events/calendars module mocks.
mock.restore();

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

const secondaryPrivate = { id: "secondary-private" };
const secondaryPublic = { id: "secondary-public" };
const primaryPrivate = { id: "primary-private" };
const primaryPublic = { id: "primary-public" };

const mockUnlockCalendarKeys = mock(async () => ({
  userKeys: [],
  addresses: [
    { ID: "addr-primary", Email: "alice@proton.me", Keys: [] },
    { ID: "addr-secondary", Email: "alice@example.com", Keys: [] },
  ],
  addressKeys: new Map([
    [
      "addr-primary",
      {
        addressId: "addr-primary",
        email: "alice@proton.me",
        privateKey: primaryPrivate,
        publicKey: primaryPublic,
      },
    ],
    [
      "addr-secondary",
      {
        addressId: "addr-secondary",
        email: "alice@example.com",
        privateKey: secondaryPrivate,
        publicKey: secondaryPublic,
      },
    ],
  ]),
}));

const decryptCalls: Array<{ decryptionKeys: unknown[]; verificationKeys: unknown[] }> = [];

mock.module("../src/crypto/unlock.ts", () => ({
  unlockCalendarKeys: mockUnlockCalendarKeys,
  primaryAddressKey: () => ({
    addressId: "addr-primary",
    email: "alice@proton.me",
    privateKey: primaryPrivate,
    publicKey: primaryPublic,
  }),
}));

mock.module("../src/crypto/proxy.ts", () => ({
  getCalendarCrypto: async () => ({
    decryptMessage: async (options: {
      decryptionKeys: unknown[];
      verificationKeys: unknown[];
    }) => {
      decryptCalls.push({
        decryptionKeys: options.decryptionKeys,
        verificationKeys: options.verificationKeys,
      });
      return { data: new Uint8Array([112, 97, 115, 115]) };
    },
    importPrivateKey: async () => ({ calendar: true }),
  }),
}));

const { unlockCalendarForEvents } = await import(
  `../src/crypto/calendar-unlock.ts?member=${Date.now()}`
);

function mockFetch(routes: Record<string, () => unknown>) {
  return (async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const path = url.includes("://")
      ? new URL(url).pathname
      : url.replace(/\?.*$/, "");
    const handler = routes[path];
    if (!handler) throw new Error(`unexpected fetch: ${path}`);
    return new Response(JSON.stringify(handler()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

describe("calendar unlock address key", () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    decryptCalls.length = 0;
    mockUnlockCalendarKeys.mockClear();
  });

  test("uses member.AddressID key for secondary-address calendars", async () => {
    const fetchImpl = mockFetch({
      "/calendar/v1/cal-secondary/members": () => ({
        Code: 1000,
        Members: [
          {
            ID: "mem-2",
            AddressID: "addr-secondary",
            Email: "alice@example.com",
          },
        ],
      }),
      "/calendar/v1/cal-secondary/passphrase": () => ({
        Code: 1000,
        Passphrase: {
          MemberPassphrases: [
            {
              MemberID: "mem-2",
              Passphrase: "armored-pass",
              Signature: "armored-sig",
            },
          ],
        },
      }),
      "/calendar/v1/cal-secondary/keys": () => ({
        Code: 1000,
        Keys: [{ PrivateKey: "cal-key" }],
      }),
    });

    const ctx = await unlockCalendarForEvents({
      session: mockSession,
      calendarId: "cal-secondary",
      password: "secret",
      fetchImpl,
    });

    expect(ctx.memberId).toBe("mem-2");
    expect(ctx.email).toBe("alice@example.com");
    expect(ctx.addressPrivateKey).toBe(secondaryPrivate);
    expect(ctx.addressPublicKey).toBe(secondaryPublic);
    expect(decryptCalls[0]?.decryptionKeys).toEqual([secondaryPrivate]);
    expect(decryptCalls[0]?.verificationKeys).toEqual([secondaryPublic]);
  });
});
