import { productDataDir } from "@bkramer/proton-core";
import { join } from "node:path";
import { TUNNEL_INTERFACE } from "../proton/constants.ts";

/** VPN state under ~/.config/proton-cli/vpn/ */
export function configDir(): string {
  return productDataDir("vpn");
}

export function sessionPath(): string {
  return join(configDir(), "session.json");
}

export function tunnelMetaPath(): string {
  return join(configDir(), "active-tunnel.json");
}

export function wireguardConfPath(): string {
  return join(configDir(), `${TUNNEL_INTERFACE}.conf`);
}

export function logicalsCachePath(): string {
  return join(configDir(), "logicals-cache.json");
}

export function wireguardCredentialsPath(): string {
  return join(configDir(), "wireguard-credentials.json");
}
