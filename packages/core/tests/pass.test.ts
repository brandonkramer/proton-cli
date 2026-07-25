import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  looksLikePassId,
  msUntilNextTotpWindow,
  normalizePassItemRef,
  resolvePassRef,
  resolvePassRefFromEnv,
} from "../src/pass.ts";
import { setConfigRootForTests } from "../src/paths.ts";
import { saveAccountPassRef } from "../src/store.ts";

describe("pass helpers", () => {
  test("normalizePassItemRef accepts pass:// and bare refs", () => {
    expect(normalizePassItemRef("pass://Vault/Item")).toBe(
      "pass://Vault/Item",
    );
    expect(normalizePassItemRef("Vault/Item/password")).toBe(
      "pass://Vault/Item",
    );
  });

  test("looksLikePassId detects share/item ids", () => {
    expect(
      looksLikePassId(
        "HtBr3GwdjDD4Iv83c9YObPhRkCSF82x34AFbm1cU7CJ1vv2ckyAAwS8EsnhP-9ZGUbsyBTMKSYex-4Xp5eMkdA==",
      ),
    ).toBe(true);
    expect(looksLikePassId("proton.me")).toBe(false);
    expect(looksLikePassId("Personal")).toBe(false);
  });

  test("msUntilNextTotpWindow lands in the next period", () => {
    const wait = msUntilNextTotpWindow(30_000 * 10 + 1_000);
    expect(wait).toBeGreaterThan(29_000);
    expect(wait).toBeLessThanOrEqual(30_750);
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

  test("resolvePassRef falls back to saved account passRef", async () => {
    const root = await mkdtemp(join(tmpdir(), "proton-cli-pass-"));
    setConfigRootForTests(root);
    const prev = {
      PROTON_PASS: process.env.PROTON_PASS,
      PROTONVPN_PASS: process.env.PROTONVPN_PASS,
      PROTONAUTH_PASS: process.env.PROTONAUTH_PASS,
    };
    try {
      delete process.env.PROTON_PASS;
      delete process.env.PROTONVPN_PASS;
      delete process.env.PROTONAUTH_PASS;
      await saveAccountPassRef("pass://Vault/Item");
      expect(await resolvePassRef()).toBe("pass://Vault/Item");
      expect(await resolvePassRef("pass://Other/Item")).toBe("pass://Other/Item");
    } finally {
      setConfigRootForTests(null);
      if (prev.PROTON_PASS === undefined) delete process.env.PROTON_PASS;
      else process.env.PROTON_PASS = prev.PROTON_PASS;
      if (prev.PROTONVPN_PASS === undefined) delete process.env.PROTONVPN_PASS;
      else process.env.PROTONVPN_PASS = prev.PROTONVPN_PASS;
      if (prev.PROTONAUTH_PASS === undefined) delete process.env.PROTONAUTH_PASS;
      else process.env.PROTONAUTH_PASS = prev.PROTONAUTH_PASS;
      await rm(root, { recursive: true, force: true });
    }
  });
});
