#!/usr/bin/env bun
/**
 * Compatibility wrapper: protonauth … → proton auth …
 */
const args = process.argv.slice(2);
const forwarded = ["auth", ...args];
process.argv = [process.argv[0]!, process.argv[1]!, ...forwarded];
await import("../index.ts");
