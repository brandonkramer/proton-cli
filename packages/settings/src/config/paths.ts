import { productDataDir } from "@bkramer/proton-core";
import { join } from "node:path";

export function configDir(): string {
  return productDataDir("settings");
}

export function sessionPath(): string {
  return join(configDir(), "session.json");
}
