import { preferNonInteractive } from "./agent.ts";
import { CliError } from "./errors.ts";

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function handleCommandError(error: unknown): Promise<void> {
  const message = messageOf(error);

  process.exitCode = 1;

  if (preferNonInteractive()) {
    process.stderr.write(`error: ${message}\n`);
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
