import { describe, expect, test } from "bun:test";
import { normalizePassItemRef, resolvePassRefFromEnv } from "../src/pass.ts";

describe("pass helpers", () => {
  test("normalizePassItemRef accepts pass:// and bare refs", () => {
    expect(normalizePassItemRef("pass://Personal/Proton")).toBe(
      "pass://Personal/Proton",
    );
    expect(normalizePassItemRef("Personal/Proton/password")).toBe(
      "pass://Personal/Proton",
    );
  });

  test("resolvePassRefFromEnv prefers option then env candidates", () => {
    const prev = {
      PROTON_PASS: process.env.PROTON_PASS,
      PROTONVPN_PASS: process.env.PROTONVPN_PASS,
    };
    try {
      delete process.env.PROTON_PASS;
      process.env.PROTONVPN_PASS = "Vault/Item";
      expect(resolvePassRefFromEnv(undefined)).toBe("Vault/Item");
      expect(resolvePassRefFromEnv("Other/Item")).toBe("Other/Item");
    } finally {
      if (prev.PROTON_PASS === undefined) delete process.env.PROTON_PASS;
      else process.env.PROTON_PASS = prev.PROTON_PASS;
      if (prev.PROTONVPN_PASS === undefined) delete process.env.PROTONVPN_PASS;
      else process.env.PROTONVPN_PASS = prev.PROTONVPN_PASS;
    }
  });
});
