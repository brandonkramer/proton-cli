import { ImapFlow, type ImapFlowOptions } from "imapflow";
import type { MailConfig, MailServerConfig } from "../config/schema.ts";
import { resolveBridgePassword } from "../config/password.ts";
import { loadMailConfig } from "../config/store.ts";
import { bridgeTlsOptions } from "../util/tls.ts";
import { CliError } from "../util/errors.ts";
import { MailExitCode } from "../util/exit.ts";
import { cliErrorFromUnknown } from "../util/exit-map.ts";

export interface ImapConnectOptions {
  config: MailConfig;
  password: string;
}

export function imapFlowOptions(
  server: MailServerConfig,
  auth: { user: string; pass: string },
): ImapFlowOptions {
  const tls = bridgeTlsOptions(server.host);
  const options: ImapFlowOptions = {
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
    logger: false,
  };

  if (tls.servername) {
    options.servername = tls.servername;
  }

  return options;
}

export async function resolveImapCredentials(
  config: MailConfig,
): Promise<{ user: string; pass: string }> {
  const password = await resolveBridgePassword(config);
  if (!password) {
    throw new CliError(
      "Bridge password is not configured.\n" +
        "Set PROTONMAIL_PASSWORD, PROTONMAIL_PASS, or configure Pass/file in `proton mail setup`.",
      "password_missing",
      MailExitCode.AUTH,
    );
  }

  return { user: config.username, pass: password };
}

export async function connectImap(options: ImapConnectOptions): Promise<ImapFlow> {
  const client = new ImapFlow(
    imapFlowOptions(options.config.imap, {
      user: options.config.username,
      pass: options.password,
    }),
  );

  try {
    await client.connect();
    return client;
  } catch (error) {
    try {
      await client.logout();
    } catch {
      // ignore cleanup errors
    }
    throw cliErrorFromUnknown(error, "imap_connect_failed");
  }
}

export async function connectImapFromStore(): Promise<{
  client: ImapFlow;
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
  const client = await connectImap({
    config,
    password: auth.pass,
  });
  return { client, config };
}

export async function selectMailbox(client: ImapFlow, mailbox: string) {
  try {
    return await client.getMailboxLock(mailbox);
  } catch (error) {
    throw cliErrorFromUnknown(error, "mailbox_select_failed");
  }
}

export async function withImapSession<T>(
  fn: (client: ImapFlow, config: MailConfig) => Promise<T>,
): Promise<T> {
  const { client, config } = await connectImapFromStore();
  try {
    return await fn(client, config);
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }
  }
}
