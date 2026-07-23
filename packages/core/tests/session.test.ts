import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearAllSessions,
  dualMintSignIn,
  loadAccount,
  loadProductSession,
  parseProductList,
  sessionPath,
  setConfigRootForTests,
  type Session,
} from "../src/index.ts";

function fakeSession(uid: string): Session {
  return {
    Code: 1000,
    AccessToken: `access-${uid}`,
    RefreshToken: `refresh-${uid}`,
    TokenType: "Bearer",
    Scopes: ["full"],
    UID: uid,
    UserID: "user-1",
    ExpiresIn: 3600,
  };
}

describe("paths + dual-mint sign-in", () => {
  afterEach(async () => {
    setConfigRootForTests(null);
  });

  test("parseProductList accepts vpn, auth, all", () => {
    expect(parseProductList(undefined)).toEqual(["vpn", "authenticator"]);
    expect(parseProductList("all")).toEqual(["vpn", "authenticator"]);
    expect(parseProductList("vpn,auth")).toEqual(["vpn", "authenticator"]);
    expect(parseProductList("authenticator")).toEqual(["authenticator"]);
  });

  test("session paths are product-scoped under shared root", async () => {
    const root = await mkdtemp(join(tmpdir(), "proton-cli-"));
    setConfigRootForTests(root);
    expect(sessionPath("vpn")).toBe(join(root, "sessions", "vpn.json"));
    expect(sessionPath("authenticator")).toBe(
      join(root, "sessions", "authenticator.json"),
    );
    await rm(root, { recursive: true, force: true });
  });

  test("dualMintSignIn mints and stores both product sessions", async () => {
    const root = await mkdtemp(join(tmpdir(), "proton-cli-"));
    setConfigRootForTests(root);

    const calls: string[] = [];
    const result = await dualMintSignIn({
      credentials: {
        username: "alice@example.com",
        password: "secret",
        totp: "123456",
      },
      products: ["vpn", "authenticator"],
      authenticators: {
        vpn: async (creds) => {
          calls.push(`vpn:${creds.username}:${creds.totp}`);
          return { product: "vpn", session: fakeSession("vpn-uid") };
        },
        authenticator: async (creds) => {
          calls.push(`auth:${creds.username}:${creds.password}`);
          return {
            product: "authenticator",
            session: fakeSession("auth-uid"),
          };
        },
      },
    });

    expect(result.failed).toEqual([]);
    expect(result.succeeded).toEqual(["vpn", "authenticator"]);
    expect(calls).toEqual([
      "vpn:alice@example.com:123456",
      "auth:alice@example.com:secret",
    ]);

    const vpn = await loadProductSession("vpn");
    const auth = await loadProductSession("authenticator");
    const account = await loadAccount();

    expect(vpn?.session.UID).toBe("vpn-uid");
    expect(auth?.session.UID).toBe("auth-uid");
    expect(vpn?.session.AccessToken).not.toBe(auth?.session.AccessToken);
    expect(account?.username).toBe("alice@example.com");
    expect(account?.products).toEqual(["vpn", "authenticator"]);

    await clearAllSessions();
    expect(await loadProductSession("vpn")).toBeNull();
    expect(await loadProductSession("authenticator")).toBeNull();
    expect(await loadAccount()).toBeNull();

    await rm(root, { recursive: true, force: true });
  });

  test("dualMintSignIn rolls back on failure by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "proton-cli-"));
    setConfigRootForTests(root);

    const result = await dualMintSignIn({
      credentials: { username: "bob", password: "x" },
      products: ["vpn", "authenticator"],
      authenticators: {
        vpn: async () => ({ product: "vpn", session: fakeSession("vpn-uid") }),
        authenticator: async () => {
          throw new Error("captcha required");
        },
      },
    });

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([
      { product: "authenticator", error: "captcha required" },
    ]);
    expect(await loadProductSession("vpn")).toBeNull();
    expect(await loadAccount()).toBeNull();

    await rm(root, { recursive: true, force: true });
  });
});
