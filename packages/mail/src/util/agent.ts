export function envFlagEnabled(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function isExplicitAgent(): boolean {
  return (
    envFlagEnabled("PROTONMAIL_AGENT") ||
    envFlagEnabled("PROTON_AGENT") ||
    envFlagEnabled("CI")
  );
}

export function preferNonInteractive(): boolean {
  if (isExplicitAgent()) return true;
  if (!process.stdin.isTTY) return true;
  const output = process.env.PROTONMAIL_OUTPUT?.trim().toLowerCase();
  if (output === "json" || output === "plain") return true;
  return false;
}

/** True when the user/agent asked for machine-readable JSON. */
export function wantsJson(): boolean {
  const output = process.env.PROTONMAIL_OUTPUT?.trim().toLowerCase();
  return output === "json" || isExplicitAgent();
}

/** Quiet UI: skip Ink spinners/holds (JSON/agent/CI or non-TTY stdout). */
export function isQuietUi(): boolean {
  return wantsJson() || isExplicitAgent() || !process.stdout.isTTY;
}

export function emitPlain(message: string): void {
  if (wantsJson()) return;
  process.stdout.write(`${message}\n`);
}
