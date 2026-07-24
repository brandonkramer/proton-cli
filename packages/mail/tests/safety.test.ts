import { afterEach, describe, expect, test } from "bun:test";
import {
  assertSendAllowed,
  isReadOnly,
  isSendAllowed,
} from "../src/util/safety.ts";
import { CliError } from "../src/util/errors.ts";

const ENV_KEYS = ["PROTONMAIL_READ_ONLY", "PROTONMAIL_ALLOW_SEND"] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

describe("mail safety gates", () => {
  test("default allows send", () => {
    expect(isReadOnly()).toBe(false);
    expect(isSendAllowed()).toBe(true);
    expect(() => assertSendAllowed()).not.toThrow();
  });

  test("PROTONMAIL_READ_ONLY blocks send", () => {
    process.env.PROTONMAIL_READ_ONLY = "1";
    expect(isReadOnly()).toBe(true);
    expect(isSendAllowed()).toBe(false);
    expect(() => assertSendAllowed()).toThrow(CliError);
    expect(() => assertSendAllowed()).toThrow(/READ_ONLY/);
  });

  test("PROTONMAIL_ALLOW_SEND=false blocks send", () => {
    process.env.PROTONMAIL_ALLOW_SEND = "false";
    expect(isSendAllowed()).toBe(false);
    expect(() => assertSendAllowed()).toThrow(/ALLOW_SEND/);
  });

  test("PROTONMAIL_ALLOW_SEND=0 blocks send", () => {
    process.env.PROTONMAIL_ALLOW_SEND = "0";
    expect(isSendAllowed()).toBe(false);
  });

  test("PROTONMAIL_ALLOW_SEND=true allows send", () => {
    process.env.PROTONMAIL_ALLOW_SEND = "true";
    expect(isSendAllowed()).toBe(true);
    expect(() => assertSendAllowed()).not.toThrow();
  });
});
