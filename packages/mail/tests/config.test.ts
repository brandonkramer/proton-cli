import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setConfigRootForTests } from "@bkramer/proton-core";
import { configDir, configPath } from "../src/config/paths.ts";
import { PASSWORD_ENV, passwordStatusFromConfig } from "../src/config/password.ts";
import {
  defaultMailConfig,
  parseMailConfig,
} from "../src/config/schema.ts";
import {
  loadMailConfig,
  saveMailConfig,
} from "../src/config/store.ts";
import {
  buildStatusPayload,
  formatStatusPlain,
} from "../src/commands/status.ts";

describe("mail config paths", () => {
  afterEach(() => {
    setConfigRootForTests(null);
    delete process.env[PASSWORD_ENV];
    delete process.env.PROTONMAIL_PASS;
  });

  test("uses shared proton-cli config root with mail subdir", async () => {
    const root = await mkdtemp(join(tmpdir(), "proton-cli-mail-"));
    setConfigRootForTests(root);
    expect(configDir()).toBe(join(root, "mail"));
    expect(configPath()).toBe(join(root, "mail", "config.json"));
    await rm(root, { recursive: true, force: true });
  });

  test("save and load round-trip without plaintext password", async () => {
    const root = await mkdtemp(join(tmpdir(), "proton-cli-mail-"));
    setConfigRootForTests(root);

    const config = defaultMailConfig({
      username: "alice@proton.me",
      email: "alice@proton.me",
      passwordPassRef: "pass://Personal/Bridge",
    });
    await saveMailConfig(config);

    const raw = await readFile(configPath(), "utf8");
    expect(raw).not.toContain("bridge-secret");
    expect(raw).toContain("pass://Personal/Bridge");

    const loaded = await loadMailConfig();
    expect(loaded).toEqual(config);
    await rm(root, { recursive: true, force: true });
  });

  test("parseMailConfig validates server ports", () => {
    const base = defaultMailConfig({ username: "u@example.com" });
    expect(parseMailConfig(base)).toEqual(base);
    expect(() =>
      parseMailConfig({
        ...base,
        imap: { ...base.imap, port: 0 },
      }),
    ).toThrow(/imap\.port/);
  });

  test("password status prefers env over config file refs", async () => {
    const config = defaultMailConfig({
      username: "alice@proton.me",
      passwordPassRef: "pass://Personal/Bridge",
    });
    process.env[PASSWORD_ENV] = "super-secret-bridge-password";
    const status = passwordStatusFromConfig(config);
    expect(status.configured).toBe(true);
    expect(status.source).toBe("env");
    expect(status.detail).toBe(`$${PASSWORD_ENV}`);
  });
});

describe("status output", () => {
  afterEach(() => {
    setConfigRootForTests(null);
    delete process.env[PASSWORD_ENV];
  });

  test("never includes resolved password in plain or json payloads", async () => {
    const root = await mkdtemp(join(tmpdir(), "proton-cli-mail-"));
    setConfigRootForTests(root);
    process.env[PASSWORD_ENV] = "top-secret-bridge-password";

    const config = defaultMailConfig({
      username: "alice@proton.me",
    });
    await saveMailConfig(config);

    const loaded = await loadMailConfig();
    const payload = buildStatusPayload(loaded);
    const plain = formatStatusPlain(payload).join("\n");
    const json = JSON.stringify(payload);

    expect(plain).not.toContain("top-secret-bridge-password");
    expect(json).not.toContain("top-secret-bridge-password");
    expect(payload.password.source).toBe("env");
    expect(payload.password.detail).toBe(`$${PASSWORD_ENV}`);

    await rm(root, { recursive: true, force: true });
  });

  test("password file path is shown but file contents are not", async () => {
    const root = await mkdtemp(join(tmpdir(), "proton-cli-mail-"));
    setConfigRootForTests(root);
    const secretPath = join(root, "bridge.pass");
    await writeFile(secretPath, "file-stored-secret\n", { mode: 0o600 });

    const config = defaultMailConfig({
      username: "alice@proton.me",
      passwordFile: secretPath,
    });
    await saveMailConfig(config);
    const payload = buildStatusPayload(await loadMailConfig());
    const serialized = JSON.stringify(payload);

    expect(serialized).toContain(secretPath);
    expect(serialized).not.toContain("file-stored-secret");

    await rm(root, { recursive: true, force: true });
  });
});
