/**
 * Agent / scripting mode: JSON output, non-interactive confirmations.
 *
 * Enable via --json, --output json, -y/--yes, or env:
 *   PROTONSETTINGS_JSON=1  PROTONSETTINGS_AGENT=1  PROTON_AGENT=1  CI=true
 */

export interface AgentFlags {
  json: boolean;
  yes: boolean;
  dryRun: boolean;
}

const flags: AgentFlags = {
  json: false,
  yes: false,
  dryRun: false,
};

export function configureAgentFlags(partial: Partial<AgentFlags>): void {
  if (partial.json !== undefined) flags.json = partial.json;
  if (partial.yes !== undefined) flags.yes = partial.yes;
  if (partial.dryRun !== undefined) flags.dryRun = partial.dryRun;
}

export function agentFlags(): Readonly<AgentFlags> {
  return flags;
}

function envTruthy(name: string): boolean {
  const value = process.env[name];
  if (!value) return false;
  return value !== "0" && value.toLowerCase() !== "false" && value !== "";
}

export function wantsJson(): boolean {
  return (
    flags.json ||
    envTruthy("PROTONSETTINGS_JSON") ||
    envTruthy("PROTONSETTINGS_AGENT") ||
    envTruthy("PROTON_AGENT") ||
    envTruthy("PROTON_JSON")
  );
}

export function isAgentEnv(): boolean {
  return (
    envTruthy("PROTONSETTINGS_AGENT") ||
    envTruthy("PROTON_AGENT") ||
    envTruthy("CI")
  );
}

export function isNonInteractive(): boolean {
  return flags.yes || wantsJson() || isAgentEnv() || !process.stdin.isTTY;
}

export function preferNonInteractive(): boolean {
  return isNonInteractive();
}

export function isDryRun(): boolean {
  return flags.dryRun;
}

export const AGENT_SCHEMA_VERSION = 1 as const;

export function emitOk(data: Record<string, unknown>): void {
  if (wantsJson()) {
    process.stdout.write(
      `${JSON.stringify({ ok: true, version: AGENT_SCHEMA_VERSION, ...data })}\n`,
    );
    return;
  }
  const message = data.message;
  if (typeof message === "string") {
    process.stdout.write(`${message}\n`);
  }
}

export function emitError(
  message: string,
  exitCode: number,
  extra: Record<string, unknown> = {},
): void {
  process.exitCode = exitCode;
  if (wantsJson()) {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        version: AGENT_SCHEMA_VERSION,
        error: message,
        code: exitCode,
        ...extra,
      })}\n`,
    );
    return;
  }
  process.stderr.write(`${message}\n`);
}

export function emitPlain(message: string): void {
  if (wantsJson()) return;
  process.stdout.write(`${message}\n`);
}
