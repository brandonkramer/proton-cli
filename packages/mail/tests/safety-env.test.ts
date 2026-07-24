import { afterEach, describe, expect, test } from "bun:test";
import {
  assertDestructiveAllowed,
  assertMutationAllowed,
  assertSendAllowed,
  isDestructiveConfirmed,
  isReadOnlyMode,
  isSendAllowed,
} from "../src/util/safety.ts";
import { CliError } from "../src/util/errors.ts";

const ENV_KEYS = [
  "PROTONMAIL_READ_ONLY",
  "PROTONMAIL_ALLOW_SEND",
  "PROTONMAIL_CONFIRM_DESTRUCTIVE",
] as const;

function saveEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
}

describe("send safety gates", () => {
  let savedEnv: Record<string, string | undefined>;

  afterEach(() => {
    restoreEnv(savedEnv);
  });

  test("allows send by default", () => {
    savedEnv = saveEnv();
    expect(isSendAllowed()).toBe(true);
    expect(() => assertSendAllowed()).not.toThrow();
  });

  test("refuses when PROTONMAIL_READ_ONLY is enabled", () => {
    savedEnv = saveEnv();
    process.env.PROTONMAIL_READ_ONLY = "true";

    expect(isReadOnlyMode()).toBe(true);
    expect(isSendAllowed()).toBe(false);
    expect(() => assertSendAllowed()).toThrow(CliError);
    try {
      assertSendAllowed();
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe("send_blocked_read_only");
    }
  });

  test("refuses when PROTONMAIL_ALLOW_SEND=false", () => {
    savedEnv = saveEnv();
    process.env.PROTONMAIL_ALLOW_SEND = "false";

    expect(isSendAllowed()).toBe(false);
    expect(() => assertSendAllowed()).toThrow(CliError);
    try {
      assertSendAllowed();
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe("send_blocked");
    }
  });
});

describe("mutation safety gates", () => {
  let savedEnv: Record<string, string | undefined>;

  afterEach(() => {
    restoreEnv(savedEnv);
  });

  test("allows mutations by default", () => {
    savedEnv = saveEnv();
    expect(() => assertMutationAllowed()).not.toThrow();
  });

  test("blocks mutations when read-only", () => {
    savedEnv = saveEnv();
    process.env.PROTONMAIL_READ_ONLY = "1";

    expect(() => assertMutationAllowed()).toThrow(CliError);
    try {
      assertMutationAllowed();
    } catch (error) {
      expect((error as CliError).code).toBe("mutation_blocked_read_only");
    }
  });
});

describe("destructive safety gates", () => {
  let savedEnv: Record<string, string | undefined>;

  afterEach(() => {
    restoreEnv(savedEnv);
  });

  test("requires confirmation by default", () => {
    savedEnv = saveEnv();
    expect(isDestructiveConfirmed()).toBe(false);
    expect(() => assertDestructiveAllowed()).toThrow(CliError);
    try {
      assertDestructiveAllowed();
    } catch (error) {
      expect((error as CliError).code).toBe("destructive_blocked");
    }
  });

  test("allows delete with --yes", () => {
    savedEnv = saveEnv();
    expect(isDestructiveConfirmed({ yes: true })).toBe(true);
    expect(() => assertDestructiveAllowed({ yes: true })).not.toThrow();
  });

  test("allows delete when PROTONMAIL_CONFIRM_DESTRUCTIVE=1", () => {
    savedEnv = saveEnv();
    process.env.PROTONMAIL_CONFIRM_DESTRUCTIVE = "1";
    expect(isDestructiveConfirmed()).toBe(true);
    expect(() => assertDestructiveAllowed()).not.toThrow();
  });

  test("blocks delete in read-only even with confirm env", () => {
    savedEnv = saveEnv();
    process.env.PROTONMAIL_READ_ONLY = "true";
    process.env.PROTONMAIL_CONFIRM_DESTRUCTIVE = "true";

    expect(() => assertDestructiveAllowed({ yes: true })).toThrow(CliError);
    try {
      assertDestructiveAllowed({ yes: true });
    } catch (error) {
      expect((error as CliError).code).toBe("mutation_blocked_read_only");
    }
  });
});
