import { emitError, isQuietUi } from "./agent.ts";
import { CliError } from "./errors.ts";
import { ExitCode } from "./exit.ts";

export async function handleCommandError(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const exitCode =
    error instanceof CliError ? error.exitCode : ExitCode.ERROR;

  if (isQuietUi()) {
    emitError(message, exitCode);
    return;
  }

  process.stderr.write(`${message}\n`);
  process.exitCode = exitCode;
}
