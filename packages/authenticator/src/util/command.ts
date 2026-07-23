import { preferNonInteractive } from "./agent.ts";
import { CliError, errorCodeOf, safeErrorMessage } from "./errors.ts";
import {
  resolveOutputFormat,
  writeJsonError,
  writePlain,
  type OutputFormat,
} from "./output.ts";

let commandOutputFormat: OutputFormat | undefined;

/** Set by command handlers so errors match `--output`. */
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

  process.exitCode = 1;

  if (format === "json") {
    writeJsonError(code, message);
    return;
  }

  if (format === "plain" || preferNonInteractive()) {
    writePlain(`error: ${message}`);
    return;
  }

  if (error instanceof CliError || error instanceof Error) {
    const { showMessage } = await import("../ui/message.tsx");
    await showMessage({
      variant: "error",
      title: "Error",
      body: message,
      holdMs: 1400,
    });
    return;
  }

  throw error;
}
