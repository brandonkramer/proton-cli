import type { Command } from "commander";
import { isExplicitAgent, preferNonInteractive } from "./agent.ts";

export type OutputFormat = "json" | "plain" | "text";

export function resolveOutputFormat(cliOption?: string): OutputFormat {
  const fromOpt = cliOption?.trim().toLowerCase();
  if (fromOpt === "json" || fromOpt === "plain" || fromOpt === "text") {
    return fromOpt;
  }

  const fromEnv = process.env.PROTONMAIL_OUTPUT?.trim().toLowerCase();
  if (fromEnv === "json" || fromEnv === "plain" || fromEnv === "text") {
    return fromEnv;
  }

  if (isExplicitAgent()) return "json";
  if (preferNonInteractive()) return "plain";
  return "text";
}

export function addOutputOption(command: Command): Command {
  return command.option(
    "--output <format>",
    "Output format: text (TTY default), json, or plain. Also: $PROTONMAIL_OUTPUT / PROTONMAIL_AGENT=1",
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
