import { describe, expect, test } from "bun:test";
import { defaultMailConfig } from "../src/config/schema.ts";
import { smtpTransportOptions } from "../src/smtp/client.ts";

describe("smtpTransportOptions", () => {
  test("accepts Bridge self-signed TLS for localhost IP without SNI", () => {
    const config = defaultMailConfig({ username: "alice@proton.me" });
    const options = smtpTransportOptions(config.smtp, {
      user: "alice@proton.me",
      pass: "secret",
    });

    expect(options.host).toBe("127.0.0.1");
    expect(options.port).toBe(1025);
    expect(options.secure).toBe(true);
    expect(options.tls).toEqual({ rejectUnauthorized: false });
    expect(options.tls?.servername).toBeUndefined();
  });

  test("sets SNI for hostname hosts", () => {
    const config = defaultMailConfig({
      username: "alice@proton.me",
      smtp: { host: "mail.example.com", port: 465, tls: true },
    });
    const options = smtpTransportOptions(config.smtp, {
      user: "alice@proton.me",
      pass: "secret",
    });

    expect(options.tls).toEqual({
      rejectUnauthorized: false,
      servername: "mail.example.com",
    });
  });
});
