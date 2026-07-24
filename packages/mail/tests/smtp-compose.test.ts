import { describe, expect, test } from "bun:test";
import {
  buildForwardMail,
  buildReplyMail,
  buildSendMail,
} from "../src/smtp/compose.ts";
import { formatParsedHeaders } from "../src/mime/headers.ts";

describe("compose mail", () => {
  test("buildSendMail maps basic fields", () => {
    const preview = buildSendMail({
      from: "alice@proton.me",
      to: ["bob@example.com"],
      subject: "Hello",
      body: "Hi Bob",
    });

    expect(preview).toEqual({
      from: "alice@proton.me",
      to: ["bob@example.com"],
      cc: undefined,
      subject: "Hello",
      text: "Hi Bob",
      html: undefined,
      headers: undefined,
      attachments: undefined,
    });
  });

  test("buildReplyMail sets In-Reply-To and References", () => {
    const original = formatParsedHeaders({
      messageId: "<orig@proton.me>",
      inReplyTo: "<parent@proton.me>",
      references: "<root@proton.me>",
      subject: "Question",
      from: [{ name: "Bob", address: "bob@example.com" }],
      to: [{ address: "alice@proton.me" }],
      cc: [],
      date: new Date("2026-01-01T00:00:00.000Z"),
      text: "Original body",
      html: null,
    } as never);

    const preview = buildReplyMail(original, {
      from: "alice@proton.me",
      body: "Reply body",
    });

    expect(preview.to).toEqual(["Bob <bob@example.com>"]);
    expect(preview.subject).toBe("Re: Question");
    expect(preview.headers).toEqual({
      "In-Reply-To": "<orig@proton.me>",
      References: "<root@proton.me> <parent@proton.me> <orig@proton.me>",
    });
  });

  test("buildForwardMail prefixes subject and includes original body", () => {
    const original = formatParsedHeaders({
      messageId: "<orig@proton.me>",
      subject: "Report",
      from: [{ address: "bob@example.com" }],
      to: [{ address: "alice@proton.me" }],
      cc: [],
      date: new Date("2026-01-01T00:00:00.000Z"),
      text: "Quarterly numbers",
      html: null,
    } as never);

    const preview = buildForwardMail(original, {
      from: "alice@proton.me",
      to: ["carol@example.com"],
      body: "FYI",
    });

    expect(preview.subject).toBe("Fwd: Report");
    expect(preview.to).toEqual(["carol@example.com"]);
    expect(preview.text).toContain("FYI");
    expect(preview.text).toContain("Quarterly numbers");
    expect(preview.text).toContain("From: bob@example.com");
  });
});
