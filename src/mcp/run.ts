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

const WRITE_HINTS = new Set([
  "signin",
  "signout",
  "connect",
  "disconnect",
  "create",
  "update",
  "delete",
  "send",
  "reply",
  "forward",
  "upload",
  "trash",
  "empty",
  "organize",
  "set",
  "pin-key",
  "unpin-key",
  "respond",
  "restore",
  "rename",
  "move",
  "copy",
  "favorite",
  "unfavorite",
]);

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

export function needsConfirm(args: string[]): boolean {
  return args.some((a) => WRITE_HINTS.has(a));
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
