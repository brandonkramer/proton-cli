import { describe, expect, test } from "bun:test";
import {
  assertBlockHash,
  assertContiguousBlockIndices,
  buildRevisionManifest,
} from "../src/drive/crypto/download-verify.ts";
import { sha256Base64 } from "../src/drive/crypto/proxy.ts";
import { configureAgentFlags } from "../src/util/agent.ts";
import { requireDestructiveConfirm } from "../src/util/confirm.ts";

describe("assertContiguousBlockIndices", () => {
  test("accepts 1..n", () => {
    expect(() => assertContiguousBlockIndices([1, 2, 3])).not.toThrow();
  });

  test("rejects gaps / reorders / duplicates / empty", () => {
    expect(() => assertContiguousBlockIndices([])).toThrow(/no content blocks/);
    expect(() => assertContiguousBlockIndices([1, 3])).toThrow(/Omitted or reordered/);
    expect(() => assertContiguousBlockIndices([2, 1])).toThrow(/Omitted or reordered/);
    expect(() => assertContiguousBlockIndices([1, 1])).toThrow(/Duplicate/);
  });
});

describe("assertBlockHash", () => {
  test("passes when hash matches or omitted", () => {
    const data = new Uint8Array([1, 2, 3]);
    expect(() => assertBlockHash(data)).not.toThrow();
    expect(() => assertBlockHash(data, sha256Base64(data))).not.toThrow();
  });

  test("fails on mismatch", () => {
    expect(() =>
      assertBlockHash(new Uint8Array([1]), "not-the-hash"),
    ).toThrow(/Block hash mismatch/);
  });
});

describe("buildRevisionManifest", () => {
  test("concatenates hashes in index order", () => {
    const map = new Map<number, Uint8Array>([
      [2, new Uint8Array([3, 4])],
      [1, new Uint8Array([1, 2])],
    ]);
    expect(buildRevisionManifest(map)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});

describe("requireDestructiveConfirm", () => {
  test("allows when --yes configured", () => {
    configureAgentFlags({ yes: true, json: false, dryRun: false });
    expect(() => requireDestructiveConfirm("Permanently deleting /x")).not.toThrow();
    configureAgentFlags({ yes: false, json: false, dryRun: false });
  });

  test("blocks interactive without --yes", () => {
    configureAgentFlags({ yes: false, json: false, dryRun: false });
    const prevCi = process.env.CI;
    const prevAgent = process.env.PROTON_AGENT;
    const prevDriveAgent = process.env.PROTON_DRIVE_AGENT;
    delete process.env.CI;
    delete process.env.PROTON_AGENT;
    delete process.env.PROTON_DRIVE_AGENT;
    const stdin = process.stdin as { isTTY?: boolean };
    const prevTty = stdin.isTTY;
    stdin.isTTY = true;
    try {
      expect(() => requireDestructiveConfirm("Emptying trash permanently")).toThrow(
        /-y\/--yes/,
      );
    } finally {
      stdin.isTTY = prevTty;
      if (prevCi !== undefined) process.env.CI = prevCi;
      else delete process.env.CI;
      if (prevAgent !== undefined) process.env.PROTON_AGENT = prevAgent;
      else delete process.env.PROTON_AGENT;
      if (prevDriveAgent !== undefined) process.env.PROTON_DRIVE_AGENT = prevDriveAgent;
      else delete process.env.PROTON_DRIVE_AGENT;
    }
  });
});
