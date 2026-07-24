import { describe, expect, test } from "bun:test";
import { buildSearchQuery } from "../src/imap/search-query.ts";
import { CliError } from "../src/util/errors.ts";

describe("buildSearchQuery", () => {
  test("builds text search", () => {
    expect(buildSearchQuery({ text: "invoice" })).toEqual({ text: "invoice" });
  });

  test("combines from/to/subject filters", () => {
    expect(
      buildSearchQuery({
        from: "alice@example.com",
        to: "bob@example.com",
        subject: "hello",
      }),
    ).toEqual({
      from: "alice@example.com",
      to: "bob@example.com",
      subject: "hello",
    });
  });

  test("maps unseen to seen=false", () => {
    expect(buildSearchQuery({ unseen: true })).toEqual({ seen: false });
  });

  test("rejects empty query", () => {
    expect(() => buildSearchQuery({})).toThrow(CliError);
  });

  test("rejects invalid since date", () => {
    expect(() => buildSearchQuery({ since: "not-a-date" })).toThrow(/Invalid since date/);
  });
});
