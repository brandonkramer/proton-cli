import { afterEach, describe, expect, test } from "bun:test";
import {
  configureAgentFlags,
  emitOk,
  isDryRun,
  wantsJson,
} from "../src/util/agent.ts";

afterEach(() => {
  configureAgentFlags({ json: false, yes: false, dryRun: false });
  delete process.env.PROTONMAIL_JSON;
  delete process.env.PROTONMAIL_AGENT;
});

describe("mail agent flags", () => {
  test("wantsJson from flag and env", () => {
    configureAgentFlags({ json: true, yes: false, dryRun: false });
    expect(wantsJson()).toBe(true);
    configureAgentFlags({ json: false, yes: false, dryRun: false });
    process.env.PROTONMAIL_JSON = "1";
    expect(wantsJson()).toBe(true);
  });

  test("isDryRun reflects local flag", () => {
    configureAgentFlags({ json: false, yes: false, dryRun: true });
    expect(isDryRun()).toBe(true);
  });

  test("emitOk writes JSON envelope", () => {
    configureAgentFlags({ json: true, yes: false, dryRun: false });
    const chunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      emitOk({ action: "list", total: 2 });
      const payload = JSON.parse(chunks.join("")) as Record<string, unknown>;
      expect(payload.ok).toBe(true);
      expect(payload.version).toBe(1);
      expect(payload.action).toBe("list");
      expect(payload.total).toBe(2);
    } finally {
      process.stdout.write = original;
    }
  });
});
