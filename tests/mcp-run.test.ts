import { describe, expect, test } from "bun:test";
import {
  needsConfirm,
  validateCliArgs,
  withAgentJson,
} from "../src/mcp/run.ts";

describe("mcp run allowlist", () => {
  test("allows common product commands", () => {
    expect(validateCliArgs(["status"])).toBeNull();
    expect(validateCliArgs(["mail", "list"])).toBeNull();
    expect(validateCliArgs(["vpn", "status"])).toBeNull();
  });

  test("denies mcp/install-mcp recursion and secrets", () => {
    expect(validateCliArgs(["mcp"])).toMatch(/not allowed/);
    expect(validateCliArgs(["install-mcp"])).toMatch(/not allowed/);
    expect(validateCliArgs(["mail", "send", "--password", "x"])).toMatch(
      /secret flag/,
    );
  });

  test("marks mutating commands as needing confirm", () => {
    expect(needsConfirm(["mail", "send"])).toBe(true);
    expect(needsConfirm(["mail", "list"])).toBe(false);
    expect(needsConfirm(["vpn", "connect", "--country", "US"])).toBe(true);
  });

  test("injects --json when missing", () => {
    expect(withAgentJson(["status"])).toEqual(["status", "--json"]);
    expect(withAgentJson(["status", "--json"])).toEqual(["status", "--json"]);
  });
});
