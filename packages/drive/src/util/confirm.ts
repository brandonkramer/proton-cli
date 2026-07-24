import { preferNonInteractive } from "./agent.ts";
import { CliError } from "./errors.ts";
import { ExitCode } from "./exit.ts";

/**
 * Gate destructive Drive mutations behind `-y/--yes` / preferNonInteractive.
 */
export function requireDestructiveConfirm(actionLabel: string): void {
  if (preferNonInteractive()) return;
  throw new CliError(
    `${actionLabel}. Re-run with -y/--yes to confirm.`,
    ExitCode.USAGE,
  );
}
