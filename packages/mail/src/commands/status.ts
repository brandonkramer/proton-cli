import type { Command } from "commander";
import { loadMailConfig } from "../config/store.ts";
import { passwordStatusFromConfig } from "../config/password.ts";
import { configDir } from "../config/paths.ts";
import {
  handleCommandError,
  setCommandOutputFormat,
} from "../util/command.ts";
import {
  addOutputOption,
  resolveOutputFormat,
  writeJson,
  writePlain,
} from "../util/output.ts";

interface StatusOptions {
  output?: string;
}

export function buildStatusPayload(config: Awaited<ReturnType<typeof loadMailConfig>>) {
  const password = passwordStatusFromConfig(config);
  const configured = Boolean(config?.username?.trim());

  return {
    ok: configured && password.configured,
    configured,
    configDir: configDir(),
    configFile: configured ? "present" : "missing",
    username: config?.username ?? null,
    email: config?.email ?? config?.username ?? null,
    imap: config?.imap ?? null,
    smtp: config?.smtp ?? null,
    password: {
      configured: password.configured,
      source: password.source,
      detail: password.detail ?? null,
    },
  };
}

export function formatStatusPlain(payload: ReturnType<typeof buildStatusPayload>): string[] {
  return [
    `configured\t${payload.configured}`,
    `ready\t${payload.ok}`,
    `configDir\t${payload.configDir}`,
    `username\t${payload.username ?? ""}`,
    `email\t${payload.email ?? ""}`,
    `imap\t${
      payload.imap
        ? `${payload.imap.host}:${payload.imap.port} tls=${payload.imap.tls}`
        : "missing"
    }`,
    `smtp\t${
      payload.smtp
        ? `${payload.smtp.host}:${payload.smtp.port} tls=${payload.smtp.tls}`
        : "missing"
    }`,
    `password\t${payload.password.configured ? payload.password.source : "missing"}`,
    ...(payload.password.detail
      ? [`passwordDetail\t${payload.password.detail}`]
      : []),
  ];
}

export function registerStatus(mail: Command): void {
  addOutputOption(
    mail
      .command("status")
      .description("Show mail config and Bridge connection status"),
  ).action(async (options: StatusOptions) => {
    try {
      const format = resolveOutputFormat(options.output);
      setCommandOutputFormat(format);

      const config = await loadMailConfig();
      const payload = buildStatusPayload(config);

      if (format === "json") {
        writeJson(payload);
        return;
      }

      writePlain(formatStatusPlain(payload));

      if (!payload.configured) {
        writePlain("");
        writePlain("Run `proton mail setup` to configure Bridge IMAP/SMTP.");
      } else if (!payload.password.configured) {
        writePlain("");
        writePlain(
          "Bridge password missing. Set PROTONMAIL_PASSWORD or configure Pass/file via setup.",
        );
      }
    } catch (error) {
      await handleCommandError(error);
    }
  });
}
