import type { Command } from "commander";
import { isExplicitAgent } from "./agent.ts";

export type OutputFormat = "ink" | "json" | "plain";

export function resolveOutputFormat(cliOption?: string): OutputFormat {
  const fromOpt = cliOption?.trim().toLowerCase();
  if (fromOpt === "json" || fromOpt === "plain" || fromOpt === "ink") {
    return fromOpt;
  }

  const fromEnv = process.env.PROTONAUTH_OUTPUT?.trim().toLowerCase();
  if (fromEnv === "json" || fromEnv === "plain" || fromEnv === "ink") {
    return fromEnv;
  }

  // Agents default to JSON so parsers don't need --output every time.
  if (isExplicitAgent()) return "json";

  return "ink";
}

/** Attach `--output <format>` to a Commander command. */
export function addOutputOption(command: Command): Command {
  return command.option(
    "--output <format>",
    "Output format: ink (TTY default), json, or plain. Also: $PROTONAUTH_OUTPUT / PROTONAUTH_AGENT=1",
  );
}

export function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function writePlain(lines: string | string[]): void {
  const text = Array.isArray(lines) ? lines.join("\n") : lines;
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

export function writeJsonError(code: string, message: string): void {
  writeJson({
    ok: false,
    error: { code, message },
  });
}
