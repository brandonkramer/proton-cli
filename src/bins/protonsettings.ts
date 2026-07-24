#!/usr/bin/env bun
/**
 * Compatibility wrapper: protonsettings … → proton settings …
 */
const args = process.argv.slice(2);
const forwarded = ["settings", ...args];
process.argv = [process.argv[0]!, process.argv[1]!, ...forwarded];
await import("../index.ts");
