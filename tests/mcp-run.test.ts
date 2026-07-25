import { describe, expect, test } from "bun:test";
import {
  isSafeRead,
  needsConfirm,
  positionalArgs,
  validateCliArgs,
  withAgentJson,
} from "../src/mcp/run.ts";
import { TOOLS } from "../src/mcp/tools.ts";

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

  test("strips flags for positional matching", () => {
    expect(positionalArgs(["mail", "list", "--label", "sent", "--json"])).toEqual(
      ["mail", "list"],
    );
    expect(positionalArgs(["vpn", "servers", "-c", "US", "--p2p"])).toEqual([
      "vpn",
      "servers",
    ]);
  });

  test("safe-read allowlist; deny-by-default confirms", () => {
    expect(isSafeRead(["mail", "list"])).toBe(true);
    expect(isSafeRead(["mail", "list", "--label", "inbox"])).toBe(true);
    expect(isSafeRead(["mail", "read", "abc"])).toBe(true);
    expect(isSafeRead(["calendar", "events", "list"])).toBe(true);
    expect(isSafeRead(["settings", "get"])).toBe(true);
    expect(isSafeRead(["settings", "mail"])).toBe(true);
    expect(isSafeRead(["account"])).toBe(true);

    expect(needsConfirm(["mail", "list"])).toBe(false);
    expect(needsConfirm(["vpn", "connect", "--country", "US"])).toBe(true);
    expect(needsConfirm(["mail", "send", "--to", "a@b.c"])).toBe(true);
    expect(needsConfirm(["mail", "forward", "id"])).toBe(true);
    expect(needsConfirm(["drive", "items", "upload", "f", "/"])).toBe(true);
    expect(needsConfirm(["drive", "items", "download", "/a", "./a"])).toBe(
      true,
    );
    expect(needsConfirm(["settings", "set", "foo", "bar"])).toBe(true);
    expect(needsConfirm(["account", "pass://Vault/Item"])).toBe(true);
    expect(needsConfirm(["signin"])).toBe(true);
    expect(needsConfirm(["update"])).toBe(true);
    // Unknown / organize paths need confirm even if not a classic verb list hit
    expect(needsConfirm(["mail", "organize", "trash", "id"])).toBe(true);
  });

  test("injects --json when missing", () => {
    expect(withAgentJson(["status"])).toEqual(["status", "--json"]);
    expect(withAgentJson(["status", "--json"])).toEqual(["status", "--json"]);
  });
});

describe("mcp curated tools", () => {
  test("exposes high-frequency curated tools plus proton_cli", () => {
    const names = TOOLS.map((t) => t.name);
    for (const name of [
      "proton_status",
      "proton_vpn_status",
      "proton_vpn_list",
      "proton_auth_code",
      "proton_mail_list",
      "proton_mail_get",
      "proton_mail_search",
      "proton_mail_send",
      "proton_mail_reply",
      "proton_contacts_list",
      "proton_contacts_create",
      "proton_calendar_upcoming",
      "proton_calendar_create",
      "proton_drive_list",
      "proton_drive_get",
      "proton_drive_upload",
      "proton_settings_get",
      "proton_cli",
    ]) {
      expect(names).toContain(name);
    }
  });
});
