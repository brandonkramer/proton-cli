import { preferNonInteractive } from "./agent.ts";
import {
  CliError,
  errorCodeOf,
  safeErrorMessage,
} from "./errors.ts";
import { exitCodeForError } from "./exit-map.ts";
import {
  resolveOutputFormat,
  writeJsonError,
  writePlain,
  type OutputFormat,
} from "./output.ts";

let commandOutputFormat: OutputFormat | undefined;

export function setCommandOutputFormat(format: OutputFormat): void {
  commandOutputFormat = format;
}

export function getCommandOutputFormat(): OutputFormat {
  return commandOutputFormat ?? resolveOutputFormat();
}

export async function handleCommandError(error: unknown): Promise<void> {
  const message = safeErrorMessage(error);
  const code = errorCodeOf(error);
  const format = getCommandOutputFormat();
  process.exitCode = exitCodeForError(error);

  if (format === "json") {
    writeJsonError(code, message);
    return;
  }

  writePlain(`error: ${message}`);
}

export function requireInteractive(message: string): void {
  if (preferNonInteractive()) {
    throw new CliError(message, "interactive_required");
  }
}
