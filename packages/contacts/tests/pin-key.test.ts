import { describe, expect, test } from "bun:test";
import { validateAccentColor } from "../src/util/colors.ts";
import { prependUnique } from "../src/util/key.ts";
import {
  buildSignedVCard,
  groupVcardField,
  parseSignedVCard,
} from "../src/vcard/vcard.ts";

describe("pin-key helpers", () => {
  test("prependUnique moves new key to front", () => {
    expect(prependUnique(["b", "a"], "c")).toEqual(["c", "b", "a"]);
    expect(prependUnique(["a"], "a")).toEqual(["a"]);
  });

  test("parseSignedVCard reads per-email crypto flags", () => {
    const vcard = buildSignedVCard({
      name: "Bob",
      uid: "uid-1",
      emails: [
        {
          address: "a@example.com",
          keyValues: ["key-a"],
          encrypt: true,
          sign: false,
          scheme: "pgp-mime",
        },
        { address: "b@example.com", keyValues: ["key-b"], encrypt: false },
      ],
    });
    const parsed = parseSignedVCard(vcard);
    expect(parsed.emails[0]?.keyValues).toEqual(["key-a"]);
    expect(parsed.emails[0]?.encrypt).toBe(true);
    expect(parsed.emails[0]?.sign).toBe(false);
    expect(parsed.emails[0]?.scheme).toBe("pgp-mime");
    expect(parsed.emails[1]?.keyValues).toEqual(["key-b"]);
    expect(parsed.emails[1]?.encrypt).toBe(false);
    expect(groupVcardField(vcard, "item2", "X-PM-ENCRYPT")).toBe("false");
  });

  test("validateAccentColor rejects unknown colors", () => {
    expect(validateAccentColor("#8080FF")).toBeNull();
    expect(validateAccentColor("#FFFFFF")).toContain("invalid color");
  });
});
