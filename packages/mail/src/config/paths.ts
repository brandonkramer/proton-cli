import { configRoot } from "@bkramer/proton-core";
import { join } from "node:path";

/** Mail state under ~/.config/proton-cli/mail/ (same root as productDataDir). */
export function configDir(): string {
  return join(configRoot(), "mail");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}
