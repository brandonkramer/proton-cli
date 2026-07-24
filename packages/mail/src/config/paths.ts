import { productDataDir } from "@bkramer/proton-core";
import { join } from "node:path";

export function configDir(): string {
  return productDataDir("mail");
}

export function sessionPath(): string {
  return join(configDir(), "session.json");
}
