import { describe, expect, mock, test } from "bun:test";
import { deliverSend } from "../src/smtp/send.ts";
import { sendViaTransport } from "../src/smtp/client.ts";

describe("deliverSend", () => {
  test("dry-run does not call SMTP send", async () => {
    const sendMail = mock(async () => ({ messageId: "<should-not-run>" }));
    const transport = { sendMail } as never;

    const result = await deliverSend(
      {
        from: "alice@proton.me",
        to: ["bob@example.com"],
        subject: "Hello",
        body: "Hi",
      },
      { dryRun: true, transport },
    );

    expect(result.dryRun).toBe(true);
    expect(result.messageId).toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
  });

  test("live send delegates to SMTP transport", async () => {
    const sendMail = mock(async () => ({ messageId: "<sent@proton.me>" }));
    const transport = { sendMail } as never;

    const result = await sendViaTransport(transport, {
      from: "alice@proton.me",
      to: "bob@example.com",
      subject: "Hello",
      text: "Hi",
    });

    expect(result.messageId).toBe("<sent@proton.me>");
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
