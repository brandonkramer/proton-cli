import { afterEach, describe, expect, test } from "bun:test";
import {
  normalizePassItemRef,
  PASS_ENV,
  resolvePassRefFromEnv,
} from "../src/pass/credentials.ts";
import { CliError } from "../src/util/errors.ts";

describe("normalizePassItemRef", () => {
  test("accepts pass://Vault/Item", () => {
    expect(normalizePassItemRef("pass://Vault/Item")).toBe("pass://Vault/Item");
  });

  test("adds pass:// when missing", () => {
    expect(normalizePassItemRef("Vault/Item")).toBe("pass://Vault/Item");
  });

  test("strips trailing field segment", () => {
    expect(normalizePassItemRef("pass://Vault/Item/password")).toBe(
      "pass://Vault/Item",
    );
    expect(normalizePassItemRef("Vault/Item/totp")).toBe("pass://Vault/Item");
  });

  test("keeps vault names that contain spaces", () => {
    expect(normalizePassItemRef("pass://My Vault/Proton Account")).toBe(
      "pass://My Vault/Proton Account",
    );
  });

  test("rejects incomplete refs", () => {
    expect(() => normalizePassItemRef("pass://Vault")).toThrow(CliError);
    expect(() => normalizePassItemRef("")).toThrow(CliError);
  });
});

describe("resolvePassRefFromEnv", () => {
  const previous = process.env[PASS_ENV];

  afterEach(() => {
    if (previous === undefined) delete process.env[PASS_ENV];
    else process.env[PASS_ENV] = previous;
  });

  test("prefers explicit option over env", () => {
    process.env[PASS_ENV] = "pass://Env/Item";
    expect(resolvePassRefFromEnv("pass://Opt/Item")).toBe("pass://Opt/Item");
  });

  test("falls back to env", () => {
    process.env[PASS_ENV] = "pass://Env/Item";
    expect(resolvePassRefFromEnv()).toBe("pass://Env/Item");
  });

  test("returns undefined when unset", () => {
    delete process.env[PASS_ENV];
    expect(resolvePassRefFromEnv()).toBeUndefined();
  });
});
