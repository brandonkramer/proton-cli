import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setConfigRootForTests } from "@bkramer/proton-core";
import {
  loadSession,
  saveSession,
} from "../src/config/store.ts";
import { sessionPath } from "../src/config/paths.ts";
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

describe("vpn session store", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "protonvpn-session-"));
    setConfigRootForTests(root);
  });

  afterEach(async () => {
    setConfigRootForTests(null);
    await rm(root, { recursive: true, force: true });
  });

  test("loadSession keeps expired access token for refresh", async () => {
    await saveSession(session, "alice");
    const path = sessionPath();
    const raw = JSON.parse(await readFile(path, "utf8")) as {
      expiresAt: string;
    };
    raw.expiresAt = new Date(Date.now() - 60_000).toISOString();
    await writeFile(path, `${JSON.stringify(raw, null, 2)}\n`);

    const loaded = await loadSession("alice");
    expect(loaded).not.toBeNull();
    expect(loaded!.session.RefreshToken).toBe("keep-refresh");
    expect(new Date(loaded!.expiresAt).getTime()).toBeLessThan(Date.now());
  });
});
