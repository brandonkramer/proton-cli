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
    envTruthy("PROTONCALENDAR_JSON") ||
    envTruthy("PROTONCALENDAR_AGENT") ||
    envTruthy("PROTON_JSON") ||
    envTruthy("PROTON_AGENT")
  );
}

export function isAgentEnv(): boolean {
  return envTruthy("PROTONCALENDAR_AGENT") || envTruthy("CI");
}

export function isNonInteractive(): boolean {
  return flags.yes || wantsJson() || isAgentEnv() || !process.stdin.isTTY;
}

/** Alias for TUI helpers (matches contacts naming). */
export function preferNonInteractive(): boolean {
  return isNonInteractive();
}

export function isDryRun(): boolean {
  return flags.dryRun;
}

export const AGENT_SCHEMA_VERSION = 1 as const;

export function emitJson(data: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ version: AGENT_SCHEMA_VERSION, ...data })}\n`);
}

export function emitOk(data: Record<string, unknown>): void {
  if (wantsJson()) {
    emitJson({ ok: true, ...data });
    return;
  }
  const message = data.message;
  if (typeof message === "string") {
    process.stdout.write(`${message}\n`);
  }
}

export function fail(message: string, exitCode = 1): never {
  process.exitCode = exitCode;
  if (wantsJson()) {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        version: AGENT_SCHEMA_VERSION,
        error: message,
        code: exitCode,
      })}\n`,
    );
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exit(exitCode);
}
