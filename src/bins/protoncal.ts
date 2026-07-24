#!/usr/bin/env bun
/**
 * Compatibility wrapper: protoncal … → proton calendar …
 */
const args = process.argv.slice(2);
const forwarded = ["calendar", ...args];
process.argv = [process.argv[0]!, process.argv[1]!, ...forwarded];
await import("../index.ts");
