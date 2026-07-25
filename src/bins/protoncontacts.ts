#!/usr/bin/env bun
/**
 * Compatibility wrapper: protoncontacts … → proton contacts …
 */
const args = process.argv.slice(2);
const forwarded = ["contacts", ...args];
process.argv = [process.argv[0]!, process.argv[1]!, ...forwarded];
await import("../index.ts");
