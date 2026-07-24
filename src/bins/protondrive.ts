#!/usr/bin/env bun
/**
 * Compatibility wrapper: protondrive … → proton drive …
 */
const args = process.argv.slice(2);
const forwarded = ["drive", ...args];
process.argv = [process.argv[0]!, process.argv[1]!, ...forwarded];
await import("../index.ts");
