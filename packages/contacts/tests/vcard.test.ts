import { describe, expect, test } from "bun:test";
import {
  escapeVCardValue,
  patchEncryptedVCard,
  setSimpleVCardProperty,
  unescapeVCardValue,
} from "../src/vcard/vcard.ts";

describe("vcard escaping + patch", () => {
  test("escape/unescape newlines commas semicolons", () => {
    const raw = "a,b;c\nd";
    expect(escapeVCardValue(raw)).toBe("a\\,b\\;c\\nd");
    expect(unescapeVCardValue(escapeVCardValue(raw))).toBe(raw);
  });

  test("setSimpleVCardProperty preserves unknown lines", () => {
    const input =
      "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Alice\r\nPHOTO:binary\r\nEND:VCARD";
    const next = setSimpleVCardProperty(input, "FN", "Bob");
    expect(next).toContain("FN:Bob");
    expect(next).toContain("PHOTO:binary");
  });

  test("patchEncryptedVCard preserves unknown props", () => {
    const input =
      "BEGIN:VCARD\r\nVERSION:4.0\r\nNOTE:old\r\nX-CUSTOM:keep\r\nEND:VCARD";
    const next = patchEncryptedVCard(input, {
      phones: [],
      note: "new",
      org: "",
      title: "",
      birthday: "",
      address: "",
      url: "",
    });
    expect(next).toContain("NOTE:new");
    expect(next).toContain("X-CUSTOM:keep");
  });
});
