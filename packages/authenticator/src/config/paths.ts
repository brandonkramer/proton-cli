import { productDataDir } from "@bkramer/proton-core";
import { join } from "node:path";

/** Authenticator state under ~/.config/proton-cli/authenticator/ */
export function configDir(): string {
  return productDataDir("authenticator");
}

export function sessionPath(): string {
  return join(configDir(), "session.json");
}

export function localEntriesPath(): string {
  return join(configDir(), "local-entries.json");
}
