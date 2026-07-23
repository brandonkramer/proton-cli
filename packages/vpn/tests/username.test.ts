import { describe, expect, test } from "bun:test";
import { normalizeUsername } from "../src/proton/auth.ts";

describe("normalizeUsername", () => {
  test("strips proton email domain", () => {
    expect(normalizeUsername("alice@proton.me")).toBe("alice");
  });

  test("keeps bare username", () => {
    expect(normalizeUsername("alice")).toBe("alice");
  });
});
