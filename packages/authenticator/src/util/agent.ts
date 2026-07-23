/**
 * Agent / non-interactive detection.
 *
 * - `PROTONAUTH_AGENT=1` or `CI=1` → explicit agent mode
 * - Non-TTY stdin → treat as non-interactive (no Ink prompts)
 * - `PROTONAUTH_OUTPUT=json|plain` → machine output (also non-interactive)
 */

export function envFlagEnabled(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/** Explicit agent/CI mode (also blocks no-args TUI). */
export function isExplicitAgent(): boolean {
  return envFlagEnabled("PROTONAUTH_AGENT") || envFlagEnabled("CI");
}

export function isInteractiveTty(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Prefer fail-fast over Ink prompts / CAPTCHA windows.
 * True when agent/CI, non-TTY, or machine output is requested.
 */
export function preferNonInteractive(): boolean {
  if (isExplicitAgent()) return true;
  if (!process.stdin.isTTY) return true;
  const output = process.env.PROTONAUTH_OUTPUT?.trim().toLowerCase();
  if (output === "json" || output === "plain") return true;
  return false;
}

/** No-args should not open the interactive menu. */
export function shouldRefuseInteractiveMenu(): boolean {
  if (isExplicitAgent()) return true;
  if (!process.stdin.isTTY) return true;
  return false;
}
