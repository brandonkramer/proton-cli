import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setConfigRootForTests } from "@bkramer/proton-core";
import { sessionPath } from "../src/config/paths.ts";
import { AUTH_REFRESH_PATH, VPN_PATH } from "../src/proton/constants.ts";
import type { Session } from "../src/proton/types.ts";

const session: Session = {
  Code: 1000,
  AccessToken: "expired-access",
  RefreshToken: "keep-refresh",
  TokenType: "Bearer",
  Scopes: ["vpn"],
  UID: "uid",
  UserID: "user",
  ExpiresIn: 3600,
};

let refreshCalled = false;

mock.module("../src/proton/http.ts", () => ({
  protonFetch: async <T>(path: string) => {
    if (path === VPN_PATH) {
      return { status: 401, data: { Code: 401 } as T };
    }
    if (path === AUTH_REFRESH_PATH) {
      refreshCalled = true;
      return {
        status: 200,
        data: {
          Code: 1000,
          AccessToken: "fresh-access",
          RefreshToken: "keep-refresh",
          TokenType: "Bearer",
          Scopes: ["vpn"],
          UID: "uid",
          UserID: "user",
          ExpiresIn: 3600,
        } as T,
      };
    }
    throw new Error(`unexpected path: ${path}`);
  },
}));

describe("tryExistingSession refresh on expired access token", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "protonvpn-try-session-"));
    setConfigRootForTests(root);
    refreshCalled = false;
  });

  afterEach(async () => {
    setConfigRootForTests(null);
    await rm(root, { recursive: true, force: true });
  });

  test("attempts refresh when verify fails", async () => {
    const { saveSession } = await import("../src/config/store.ts");
    const { tryExistingSession } = await import("../src/proton/auth.ts");

    await saveSession(session, "alice");
    const path = sessionPath();
    const raw = JSON.parse(await readFile(path, "utf8")) as {
      expiresAt: string;
    };
    raw.expiresAt = new Date(Date.now() - 60_000).toISOString();
    await writeFile(path, `${JSON.stringify(raw, null, 2)}\n`);

    const reused = await tryExistingSession("alice");
    expect(refreshCalled).toBe(true);
    expect(reused).not.toBeNull();
    expect(reused!.session.AccessToken).toBe("fresh-access");
  });
});
