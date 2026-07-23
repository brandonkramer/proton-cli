import { homedir } from "node:os";
import { join } from "node:path";
import type { ProductId } from "./products.ts";

/** Override config root (tests). */
let configRootOverride: string | null = null;

export function setConfigRootForTests(root: string | null): void {
  configRootOverride = root;
}

export function configRoot(): string {
  if (configRootOverride) return configRootOverride;

  if (process.platform === "win32") {
    const base = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(base, "proton-cli");
  }

  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, "proton-cli");
  return join(homedir(), ".config", "proton-cli");
}

export function accountPath(): string {
  return join(configRoot(), "account.json");
}

export function sessionsDir(): string {
  return join(configRoot(), "sessions");
}

export function sessionPath(product: ProductId): string {
  return join(sessionsDir(), `${product}.json`);
}

/** Product-local state (WireGuard conf, authenticator entries, …). */
export function productDataDir(product: ProductId): string {
  return join(configRoot(), product);
}
