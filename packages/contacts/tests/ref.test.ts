import { describe, expect, test } from "bun:test";
import { pickRef } from "../src/util/ref.ts";
import { AmbiguousError, NotFoundError } from "../src/util/errors.ts";
import { ExitCode } from "../src/util/exit.ts";
import { isFullId } from "../src/util/id.ts";

describe("ref", () => {
  test("pickRef returns sole match", () => {
    const match = pickRef(
      "contact",
      "alice",
      [{ id: "id-1", label: "Alice" }],
      (item) => item.id,
      (item) => item.label,
    );
    expect(match.id).toBe("id-1");
  });

  test("pickRef throws NotFound for zero matches", () => {
    expect(() =>
      pickRef(
        "contact",
        "missing",
        [],
        (item: { id: string }) => item.id,
        (item: { id: string }) => item.id,
      ),
    ).toThrow(NotFoundError);
    try {
      pickRef(
        "contact",
        "missing",
        [],
        (item: { id: string }) => item.id,
        (item: { id: string }) => item.id,
      );
    } catch (error) {
      expect((error as NotFoundError).exitCode).toBe(ExitCode.NOT_FOUND);
    }
  });

  test("pickRef throws Ambiguous for multiple matches", () => {
    expect(() =>
      pickRef(
        "contact",
        "a",
        [
          { id: "id-1", label: "Alice" },
          { id: "id-2", label: "Anna" },
        ],
        (item) => item.id,
        (item) => item.label,
      ),
    ).toThrow(AmbiguousError);
    try {
      pickRef(
        "contact",
        "a",
        [
          { id: "id-1", label: "Alice" },
          { id: "id-2", label: "Anna" },
        ],
        (item) => item.id,
        (item) => item.label,
      );
    } catch (error) {
      const ambiguous = error as AmbiguousError;
      expect(ambiguous.exitCode).toBe(ExitCode.CONFLICT);
      expect(ambiguous.candidates).toHaveLength(2);
    }
  });
});

describe("id", () => {
  test("isFullId detects proton IDs", () => {
    expect(isFullId("x".repeat(60) + "==")).toBe(true);
    expect(isFullId("short")).toBe(false);
  });
});
