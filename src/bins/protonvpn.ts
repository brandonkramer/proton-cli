#!/usr/bin/env bun
/**
 * Compatibility wrapper: protonvpn … → proton vpn …
 */
const args = process.argv.slice(2);
const forwarded = ["vpn", ...args];
process.argv = [process.argv[0]!, process.argv[1]!, ...forwarded];
await import("../index.ts");
