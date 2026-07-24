import { emitError, wantsJson } from "./agent.ts";
import { CliError } from "./errors.ts";

export function reportCommandError(error: unknown): never {
  if (error instanceof CliError) {
    emitError(error.message, 1);
  } else if (error instanceof Error) {
    emitError(error.message, 1);
  } else {
    emitError(String(error), 1);
  }
  process.exit(1);
}

export async function handleCommandError(error: unknown): Promise<void> {
  reportCommandError(error);
}
