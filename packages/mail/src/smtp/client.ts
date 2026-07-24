import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import type { MailConfig, MailServerConfig } from "../config/schema.ts";
import { resolveBridgePassword } from "../config/password.ts";
import { loadMailConfig } from "../config/store.ts";
import { resolveImapCredentials } from "../imap/client.ts";
import { bridgeTlsOptions } from "../util/tls.ts";
import { CliError } from "../util/errors.ts";
import { MailExitCode } from "../util/exit.ts";
import { cliErrorFromUnknown } from "../util/exit-map.ts";

export function smtpTransportOptions(
  server: MailServerConfig,
  auth: { user: string; pass: string },
): SMTPTransport.Options {
  const tls = bridgeTlsOptions(server.host);
  const options: SMTPTransport.Options = {
    host: server.host,
    port: server.port,
    secure: server.tls,
    auth: {
      user: auth.user,
      pass: auth.pass,
    },
    tls: {
      rejectUnauthorized: tls.rejectUnauthorized,
    },
  };

  if (tls.servername) {
    options.tls = {
      ...options.tls,
      servername: tls.servername,
    };
  }

  return options;
}

export function createSmtpTransport(
  config: MailConfig,
  password: string,
): Transporter {
  return nodemailer.createTransport(
    smtpTransportOptions(config.smtp, {
      user: config.username,
      pass: password,
    }),
  );
}

export async function connectSmtpFromStore(): Promise<{
  transport: Transporter;
  config: MailConfig;
}> {
  const config = await loadMailConfig();
  if (!config) {
    throw new CliError(
      "Mail is not configured.\nRun `proton mail setup` first.",
      "config_missing",
      MailExitCode.AUTH,
    );
  }

  const auth = await resolveImapCredentials(config);
  const transport = createSmtpTransport(config, auth.pass);
  return { transport, config };
}

export async function withSmtpSession<T>(
  fn: (transport: Transporter, config: MailConfig) => Promise<T>,
): Promise<T> {
  const { transport, config } = await connectSmtpFromStore();
  try {
    return await fn(transport, config);
  } finally {
    transport.close();
  }
}

export async function resolveFromAddress(config: MailConfig): Promise<string> {
  if (config.email?.trim()) {
    return config.email.trim();
  }
  if (config.username.includes("@")) {
    return config.username.trim();
  }

  const password = await resolveBridgePassword(config);
  if (!password) {
    throw new CliError(
      "Bridge password is not configured.\n" +
        "Set PROTONMAIL_PASSWORD, PROTONMAIL_PASS, or configure Pass/file in `proton mail setup`.",
      "password_missing",
      MailExitCode.AUTH,
    );
  }

  return config.username.trim();
}

export async function sendViaTransport(
  transport: Transporter,
  mail: nodemailer.SendMailOptions,
): Promise<{ messageId: string }> {
  try {
    const info = await transport.sendMail(mail);
    const messageId =
      typeof info.messageId === "string" && info.messageId.trim()
        ? info.messageId.trim()
        : "";
    return { messageId };
  } catch (error) {
    throw cliErrorFromUnknown(error, "smtp_send_failed");
  }
}
