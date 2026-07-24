export interface MailServerConfig {
  host: string;
  port: number;
  tls: boolean;
}

export interface MailConfig {
  version: 1;
  imap: MailServerConfig;
  smtp: MailServerConfig;
  /** Bridge IMAP/SMTP login (often your Proton address). */
  username: string;
  email?: string;
  /** Proton Pass item ref (`pass://Vault/Item`); password resolved at runtime. */
  passwordPassRef?: string;
  /** Path to a file containing the Bridge password (mode 0600 recommended). */
  passwordFile?: string;
}

export const DEFAULT_IMAP: MailServerConfig = {
  host: "127.0.0.1",
  port: 1143,
  tls: true,
};

export const DEFAULT_SMTP: MailServerConfig = {
  host: "127.0.0.1",
  port: 1025,
  tls: true,
};

export function defaultMailConfig(
  partial: Partial<MailConfig> = {},
): MailConfig {
  return {
    version: 1,
    imap: { ...DEFAULT_IMAP, ...partial.imap },
    smtp: { ...DEFAULT_SMTP, ...partial.smtp },
    username: partial.username ?? "",
    email: partial.email,
    passwordPassRef: partial.passwordPassRef,
    passwordFile: partial.passwordFile,
  };
}

export function parseMailConfig(raw: unknown): MailConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error("Mail config must be a JSON object.");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new Error(`Unsupported mail config version: ${String(obj.version)}`);
  }

  const imap = parseServerConfig(obj.imap, "imap");
  const smtp = parseServerConfig(obj.smtp, "smtp");
  const username =
    typeof obj.username === "string" ? obj.username.trim() : "";
  if (!username) {
    throw new Error("Mail config is missing username.");
  }

  const email =
    typeof obj.email === "string" && obj.email.trim()
      ? obj.email.trim()
      : undefined;
  const passwordPassRef =
    typeof obj.passwordPassRef === "string" && obj.passwordPassRef.trim()
      ? obj.passwordPassRef.trim()
      : undefined;
  const passwordFile =
    typeof obj.passwordFile === "string" && obj.passwordFile.trim()
      ? obj.passwordFile.trim()
      : undefined;

  return {
    version: 1,
    imap,
    smtp,
    username,
    email,
    passwordPassRef,
    passwordFile,
  };
}

function parseServerConfig(
  value: unknown,
  label: string,
): MailServerConfig {
  if (!value || typeof value !== "object") {
    throw new Error(`Mail config is missing ${label} settings.`);
  }
  const obj = value as Record<string, unknown>;
  const host = typeof obj.host === "string" ? obj.host.trim() : "";
  const port = typeof obj.port === "number" ? obj.port : Number(obj.port);
  const tls = obj.tls === undefined ? true : Boolean(obj.tls);

  if (!host) throw new Error(`${label}.host is required.`);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label}.port must be an integer between 1 and 65535.`);
  }

  return { host, port, tls };
}
