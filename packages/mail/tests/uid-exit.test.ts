import { describe, expect, test } from "bun:test";
import { CliError } from "../src/util/errors.ts";
import { MailExitCode } from "../src/util/exit.ts";
import {
  cliErrorFromUnknown,
  exitCodeForError,
} from "../src/util/exit-map.ts";
import {
  formatMessageRef,
  parseMessageRef,
} from "../src/util/uid.ts";

describe("parseMessageRef", () => {
  test("accepts INBOX::25642", () => {
    expect(parseMessageRef("INBOX::25642")).toEqual({
      mailbox: "INBOX",
      uid: 25642,
    });
  });

  test("trims surrounding whitespace", () => {
    expect(parseMessageRef("  Sent::42  ")).toEqual({
      mailbox: "Sent",
      uid: 42,
    });
  });

  test("accepts mailbox names with spaces", () => {
    expect(parseMessageRef("All Mail::1")).toEqual({
      mailbox: "All Mail",
      uid: 1,
    });
  });

  test("rejects empty input", () => {
    expect(() => parseMessageRef("")).toThrow(CliError);
    try {
      parseMessageRef("");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).exitCode).toBe(MailExitCode.USER);
      expect((error as CliError).code).toBe("invalid_message_ref");
    }
  });

  test("rejects missing uid", () => {
    expect(() => parseMessageRef("INBOX::")).toThrow(/Expected Mailbox::uid/);
  });

  test("rejects non-numeric uid", () => {
    expect(() => parseMessageRef("INBOX::abc")).toThrow(/Expected Mailbox::uid/);
  });

  test("rejects uid zero", () => {
    expect(() => parseMessageRef("INBOX::0")).toThrow(/Expected Mailbox::uid/);
  });

  test("rejects separator-only ref", () => {
    expect(() => parseMessageRef("::25642")).toThrow(/Expected Mailbox::uid/);
  });
});

describe("formatMessageRef", () => {
  test("round-trips with parseMessageRef", () => {
    const ref = formatMessageRef("INBOX", 25642);
    expect(ref).toBe("INBOX::25642");
    expect(parseMessageRef(ref)).toEqual({ mailbox: "INBOX", uid: 25642 });
  });

  test("rejects empty mailbox", () => {
    expect(() => formatMessageRef("  ", 1)).toThrow(CliError);
  });

  test("rejects invalid uid", () => {
    expect(() => formatMessageRef("INBOX", 0)).toThrow(CliError);
  });
});

describe("exitCodeForError", () => {
  test("preserves CliError exit codes", () => {
    const err = new CliError("missing config", "config_missing", MailExitCode.AUTH);
    expect(exitCodeForError(err)).toBe(MailExitCode.AUTH);
  });

  test("maps auth failures", () => {
    expect(exitCodeForError(new Error("Authentication failed"))).toBe(
      MailExitCode.AUTH,
    );
  });

  test("maps not found", () => {
    expect(exitCodeForError(new Error("Mailbox not found"))).toBe(
      MailExitCode.NOT_FOUND,
    );
  });

  test("maps conflict", () => {
    expect(exitCodeForError(new Error("Ambiguous match for query"))).toBe(
      MailExitCode.CONFLICT,
    );
  });

  test("maps network errno", () => {
    const err = new Error("connect ECONNREFUSED") as NodeJS.ErrnoException;
    err.code = "ECONNREFUSED";
    expect(exitCodeForError(err)).toBe(MailExitCode.NETWORK);
  });

  test("maps timeout messages", () => {
    expect(exitCodeForError(new Error("Connection timed out."))).toBe(
      MailExitCode.NETWORK,
    );
  });

  test("defaults unknown errors to user error", () => {
    expect(exitCodeForError(new Error("something odd"))).toBe(MailExitCode.USER);
  });

  test("cliErrorFromUnknown wraps with mapped exit code", () => {
    const wrapped = cliErrorFromUnknown(new Error("Authentication failed"));
    expect(wrapped).toBeInstanceOf(CliError);
    expect(wrapped.exitCode).toBe(MailExitCode.AUTH);
    expect(wrapped.code).toBe("error");
  });
});
