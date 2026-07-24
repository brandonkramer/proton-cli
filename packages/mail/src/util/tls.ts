import { isIP } from "node:net";

/** Whether the host is a literal IP (no SNI). Matches PH0 connectivity probes. */
export function isIpHost(host: string): boolean {
  if (host === "localhost") return false;
  if (/^\[[\da-f:]+\]$/i.test(host)) return true;
  return isIP(host) !== 0;
}

export interface BridgeTlsOptions {
  rejectUnauthorized: false;
  servername?: string;
}

/** TLS options for Bridge self-signed certs; omit SNI for IP hosts. */
export function bridgeTlsOptions(host: string): BridgeTlsOptions {
  const tls: BridgeTlsOptions = { rejectUnauthorized: false };
  if (!isIpHost(host)) {
    tls.servername = host;
  }
  return tls;
}
