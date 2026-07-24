import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { connect as netConnect, type Socket } from "node:net";
import type { MailServerConfig } from "../config/schema.ts";
import { bridgeTlsOptions } from "./tls.ts";

const PROBE_TIMEOUT_MS = 8_000;

export interface ProbeResult {
  ok: boolean;
  service: "imap" | "smtp";
  endpoint: string;
  message: string;
  detail?: string;
}

export async function probeImap(config: MailServerConfig): Promise<ProbeResult> {
  const endpoint = `${config.host}:${config.port}`;
  try {
    const { socket, banner } = await connectMailService(config);
    const greeting = banner.trim();
    socket.destroy();

    if (!/^\* OK/i.test(greeting)) {
      return {
        ok: false,
        service: "imap",
        endpoint,
        message: "IMAP greeting was not received.",
        detail: greeting.slice(0, 200) || undefined,
      };
    }

    return {
      ok: true,
      service: "imap",
      endpoint,
      message: "IMAP reachable.",
      detail: greeting.slice(0, 120),
    };
  } catch (error) {
    return imapFailure(endpoint, error);
  }
}

export async function probeSmtp(config: MailServerConfig): Promise<ProbeResult> {
  const endpoint = `${config.host}:${config.port}`;
  try {
    const { socket, banner } = await connectMailService(config);
    const greeting = banner.trim();
    socket.destroy();

    if (!/^220/.test(greeting)) {
      return {
        ok: false,
        service: "smtp",
        endpoint,
        message: "SMTP greeting was not received.",
        detail: greeting.slice(0, 200) || undefined,
      };
    }

    return {
      ok: true,
      service: "smtp",
      endpoint,
      message: "SMTP reachable.",
      detail: greeting.slice(0, 120),
    };
  } catch (error) {
    return smtpFailure(endpoint, error);
  }
}

async function connectMailService(
  config: MailServerConfig,
): Promise<{ socket: Socket | TLSSocket; banner: string }> {
  if (config.tls) {
    const socket = await connectTls(config.host, config.port);
    const banner = await readLine(socket);
    return { socket, banner };
  }

  const socket = await connectTcp(config.host, config.port);
  const banner = await readLine(socket);
  return { socket, banner };
}

function connectTcp(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Connection timed out."));
    }, PROBE_TIMEOUT_MS);

    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function connectTls(host: string, port: number): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const bridgeTls = bridgeTlsOptions(host);
    const tlsOptions: Parameters<typeof tlsConnect>[0] = {
      host,
      port,
      rejectUnauthorized: bridgeTls.rejectUnauthorized,
    };
    if (bridgeTls.servername) {
      tlsOptions.servername = bridgeTls.servername;
    }

    const socket = tlsConnect(tlsOptions);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("TLS connection timed out."));
    }, PROBE_TIMEOUT_MS);

    socket.once("secureConnect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function readLine(socket: Socket | TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Timed out waiting for server greeting."));
    }, PROBE_TIMEOUT_MS);

    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const idx = buffer.indexOf("\n");
      if (idx >= 0) {
        cleanup();
        resolve(buffer.slice(0, idx));
      }
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
    };

    socket.on("data", onData);
    socket.once("error", onError);
  });
}

function imapFailure(endpoint: string, error: unknown): ProbeResult {
  return {
    ok: false,
    service: "imap",
    endpoint,
    message: bridgeActionableMessage("IMAP", endpoint, error),
    detail: error instanceof Error ? error.message : String(error),
  };
}

function smtpFailure(endpoint: string, error: unknown): ProbeResult {
  return {
    ok: false,
    service: "smtp",
    endpoint,
    message: bridgeActionableMessage("SMTP", endpoint, error),
    detail: error instanceof Error ? error.message : String(error),
  };
}

function bridgeActionableMessage(
  service: "IMAP" | "SMTP",
  endpoint: string,
  error: unknown,
): string {
  const detail = error instanceof Error ? error.message : String(error);
  const refused =
    /ECONNREFUSED|connect ECONNREFUSED|Connection refused/i.test(detail);
  const timeout = /timed out|ETIMEDOUT/i.test(detail);

  if (refused || timeout) {
    return (
      `${service} is not reachable at ${endpoint}.\n` +
      "Proton Mail Bridge may not be running.\n" +
      "Install Bridge from https://proton.me/mail/bridge, sign in, and keep Bridge running.\n" +
      "Then run `proton mail setup` if host/port differ from defaults (IMAP 127.0.0.1:1143, SMTP 127.0.0.1:1025)."
    );
  }

  return `${service} probe failed for ${endpoint}: ${detail}`;
}

export const BRIDGE_HELP =
  "Bridge defaults: IMAP 127.0.0.1:1143 (TLS, self-signed cert), SMTP 127.0.0.1:1025 (TLS).";
