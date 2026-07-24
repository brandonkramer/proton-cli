#!/usr/bin/env bun
/**
 * Compatibility wrapper: protonmail … → proton mail …
 */
const args = process.argv.slice(2);
const forwarded = ["mail", ...args];
process.argv = [process.argv[0]!, process.argv[1]!, ...forwarded];
await import("../index.ts");
