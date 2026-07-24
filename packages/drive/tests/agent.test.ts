import { afterEach, describe, expect, test } from "bun:test";
import {
  configureAgentFlags,
  emitOk,
  isDryRun,
  wantsJson,
} from "../src/util/agent.ts";

afterEach(() => {
  configureAgentFlags({ json: false, yes: false, dryRun: false });
});

describe("drive agent mode", () => {
  test("wantsJson from flag", () => {
    configureAgentFlags({ json: true, yes: false, dryRun: false });
    expect(wantsJson()).toBe(true);
  });

  test("dry-run flag", () => {
    configureAgentFlags({ json: false, yes: false, dryRun: true });
    expect(isDryRun()).toBe(true);
  });

  test("emitOk json shape", () => {
    configureAgentFlags({ json: true, yes: false, dryRun: false });
    const lines: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      emitOk({ action: "test" });
      const parsed = JSON.parse(lines[0]!) as { ok: boolean; action: string };
      expect(parsed.ok).toBe(true);
      expect(parsed.action).toBe("test");
    } finally {
      process.stdout.write = original;
    }
  });
});
