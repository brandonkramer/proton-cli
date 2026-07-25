import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DENY_TOP = new Set([
  "mcp",
  "install-mcp",
  "completion",
  "help",
]);

const ALLOW_TOP = new Set([
  "account",
  "signin",
  "signout",
  "status",
  "update",
  "vpn",
  "auth",
  "contacts",
  "calendar",
  "drive",
  "settings",
  "mail",
]);

const SECRET_FLAGS = new Set([
  "--password",
  "--totp",
  "--token",
]);

/** Flags that do not consume a following value when stripping for command matching. */
const BOOLEAN_FLAGS = new Set([
  "--json",
  "-y",
  "--yes",
  "--sudo",
  "--unread",
  "--raw",
  "--html",
  "--all",
  "--p2p",
  "--securecore",
  "--tor",
  "--free-only",
  "--dry-run",
  "--force",
  "--permanent",
  "--edit",
  "--all-day",
  "-j",
  "--help",
  "-h",
  "-V",
  "--version",
]);

/**
 * Explicit safe-read command prefixes (positional argv after `proton`).
 * Anything else via `proton_cli` requires confirm=true (deny-by-default writes).
 */
const SAFE_READ_PREFIXES: readonly (readonly string[])[] = [
  ["status"],
  ["account"],
  ["vpn", "status"],
  ["vpn", "countries"],
  ["vpn", "servers"],
  ["auth", "list"],
  ["auth", "code"],
  ["auth", "status"],
  ["contacts", "list"],
  ["contacts", "get"],
  ["contacts", "groups", "list"],
  ["calendar", "calendars", "list"],
  ["calendar", "events", "list"],
  ["calendar", "events", "get"],
  ["drive", "status"],
  ["drive", "items", "list"],
  ["drive", "items", "info"],
  ["drive", "trash", "list"],
  ["drive", "photos", "list"],
  ["drive", "photos", "albums", "list"],
  ["drive", "invitations", "list"],
  ["drive", "share", "status"],
  ["settings", "get"],
  ["settings", "mail"],
  ["mail", "status"],
  ["mail", "list"],
  ["mail", "sent"],
  ["mail", "read"],
  ["mail", "search"],
  ["mail", "addresses"],
  ["mail", "labels", "list"],
  ["mail", "labels", "folders", "list"],
];

export interface RunCliResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
  argv: string[];
}

export function looksSecretFlag(arg: string): boolean {
  const base = arg.split("=")[0] ?? arg;
  return SECRET_FLAGS.has(base);
}

/** Positional tokens only (flags + their values stripped). */
export function positionalArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--") {
      out.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith("-")) {
      const flag = a.split("=")[0] ?? a;
      if (a.includes("=") || BOOLEAN_FLAGS.has(flag)) continue;
      if (i + 1 < args.length && !args[i + 1]!.startsWith("-")) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

function matchesPrefix(pos: string[], prefix: readonly string[]): boolean {
  if (pos.length < prefix.length) return false;
  return prefix.every((p, i) => pos[i] === p);
}

/** True when argv is a known non-mutating read. */
export function isSafeRead(args: string[]): boolean {
  const pos = positionalArgs(args);
  if (pos.length === 0) return false;
  // `proton account <pass-ref>` configures credentials — treat as write.
  if (pos[0] === "account" && pos.length > 1) return false;
  // `settings set` mutates; `settings mail` is a read (matched below).
  if (pos[0] === "settings" && pos[1] === "set") return false;
  return SAFE_READ_PREFIXES.some((prefix) => matchesPrefix(pos, prefix));
}

export function validateCliArgs(args: string[]): string | null {
  if (args.length === 0) return "args must be non-empty (CLI after `proton`)";
  const top = args[0]!;
  if (DENY_TOP.has(top)) return `${top} is not allowed via MCP`;
  if (!ALLOW_TOP.has(top)) {
    return `unsupported top-level command ${top} (allowed: ${[...ALLOW_TOP].join(", ")})`;
  }
  for (const arg of args) {
    if (looksSecretFlag(arg)) {
      return `secret flag ${arg.split("=")[0]} is not allowed via MCP; use saved account / env outside the tool call`;
    }
  }
  return null;
}

/** Deny-by-default: anything not on the safe-read list needs confirm=true. */
export function needsConfirm(args: string[]): boolean {
  return !isSafeRead(args);
}

export function withAgentJson(args: string[]): string[] {
  const out = [...args];
  if (!out.includes("--json") && !out.some((a) => a.startsWith("--output"))) {
    out.push("--json");
  }
  return out;
}

function protonEntry(): string {
  if (process.env.PROTON_BIN?.trim()) return process.env.PROTON_BIN.trim();
  // Prefer this package's entry when running from source / global bun link.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "index.ts");
}

export async function runProtonCli(
  args: string[],
  options: { confirm?: boolean; timeoutMs?: number } = {},
): Promise<RunCliResult> {
  const err = validateCliArgs(args);
  if (err) {
    return { ok: false, code: 1, stdout: "", stderr: err, argv: args };
  }
  if (needsConfirm(args) && !options.confirm) {
    return {
      ok: false,
      code: 1,
      stdout: "",
      stderr: "destructive/mutating command requires confirm=true",
      argv: args,
    };
  }

  const argv = withAgentJson(args);
  if (options.confirm && !argv.includes("-y") && !argv.includes("--yes")) {
    argv.push("-y");
  }

  const bin = protonEntry();
  const env = {
    ...process.env,
    PROTON_AGENT: "1",
    PROTON_JSON: "1",
    CI: process.env.CI ?? "1",
  };

  const timeoutMs = options.timeoutMs ?? 120_000;
  const useBun = bin.endsWith(".ts") || bin.endsWith(".js");
  const command = useBun ? "bun" : bin;
  const commandArgs = useBun ? ["run", bin, ...argv] : argv;

  return await new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({
        ok: false,
        code: 124,
        stdout,
        stderr: stderr || `timed out after ${timeoutMs}ms`,
        argv,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: 1,
        stdout,
        stderr: error.message,
        argv,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const exit = code ?? 1;
      resolve({
        ok: exit === 0,
        code: exit,
        stdout,
        stderr,
        argv,
      });
    });
  });
}
