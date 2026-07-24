import { describe, expect, test } from "bun:test";
import { parseMessageSource } from "../src/mime/parse.ts";

const SAMPLE = Buffer.from(
  [
    "From: Alice <alice@example.com>",
    "To: Bob <bob@example.com>",
    "Subject: Hello",
    "Date: Fri, 24 Jul 2026 12:00:00 +0000",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Plain body text",
  ].join("\r\n"),
  "utf8",
);

describe("parseMessageSource", () => {
  test("extracts headers and plain text body", async () => {
    const parsed = await parseMessageSource(SAMPLE);
    expect(parsed.subject).toBe("Hello");
    expect(parsed.from).toEqual(["Alice <alice@example.com>"]);
    expect(parsed.to).toEqual(["Bob <bob@example.com>"]);
    expect(parsed.text).toBe("Plain body text");
    expect(parsed.html).toBeNull();
    expect(parsed.date).toBeTruthy();
  });
});
