import { describe, expect, test } from "bun:test";
import { defaultMailConfig } from "../src/config/schema.ts";
import { imapFlowOptions } from "../src/imap/client.ts";

describe("imapFlowOptions", () => {
  test("accepts Bridge self-signed TLS for localhost IP without SNI", () => {
    const config = defaultMailConfig({ username: "alice@proton.me" });
    const options = imapFlowOptions(config.imap, {
      user: "alice@proton.me",
      pass: "secret",
    });

    expect(options.host).toBe("127.0.0.1");
    expect(options.port).toBe(1143);
    expect(options.secure).toBe(true);
    expect(options.servername).toBeUndefined();
    expect(options.tls).toEqual({ rejectUnauthorized: false });
  });

  test("sets SNI for hostname hosts", () => {
    const config = defaultMailConfig({
      username: "alice@proton.me",
      imap: { host: "mail.example.com", port: 993, tls: true },
    });
    const options = imapFlowOptions(config.imap, {
      user: "alice@proton.me",
      pass: "secret",
    });

    expect(options.servername).toBe("mail.example.com");
    expect(options.tls).toEqual({ rejectUnauthorized: false });
  });
});
