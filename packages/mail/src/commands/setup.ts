import type { Command } from "commander";
import { normalizePassItemRef } from "@bkramer/proton-core";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  DEFAULT_IMAP,
  DEFAULT_SMTP,
  defaultMailConfig,
  type MailConfig,
} from "../config/schema.ts";
import { saveMailConfig } from "../config/store.ts";
import { configDir } from "../config/paths.ts";
import { CliError } from "../util/errors.ts";
import { preferNonInteractive } from "../util/agent.ts";
import {
  handleCommandError,
  requireInteractive,
  setCommandOutputFormat,
} from "../util/command.ts";
import {
  addOutputOption,
  resolveOutputFormat,
  writeJson,
  writePlain,
} from "../util/output.ts";

interface SetupOptions {
  output?: string;
  imapHost?: string;
  imapPort?: string;
  imapTls?: boolean;
  smtpHost?: string;
  smtpPort?: string;
  smtpTls?: boolean;
  username?: string;
  email?: string;
  pass?: string;
  passwordFile?: string;
  yes?: boolean;
}

function parsePort(raw: string | undefined, label: string): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new CliError(`${label} port must be between 1 and 65535.`, "invalid_port");
  }
  return port;
}

function hasNonInteractiveFlags(options: SetupOptions): boolean {
  return Boolean(
    options.imapPort ||
      options.smtpPort ||
      options.username ||
      options.email ||
      options.pass ||
      options.passwordFile ||
      options.imapHost ||
      options.smtpHost ||
      options.imapTls === false ||
      options.smtpTls === false,
  );
}

async function promptLine(
  question: string,
  defaultValue?: string,
): Promise<string> {
  const rl = readline.createInterface({ input, output });
  const suffix =
    defaultValue !== undefined && defaultValue !== ""
      ? ` [${defaultValue}]`
      : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  rl.close();
  return answer || defaultValue || "";
}

async function promptYesNo(
  question: string,
  defaultYes: boolean,
): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = (await promptLine(`${question} (${hint})`, defaultYes ? "y" : "n"))
    .trim()
    .toLowerCase();
  if (!answer) return defaultYes;
  return answer.startsWith("y");
}

async function runInteractiveSetup(): Promise<MailConfig> {
  requireInteractive(
    "Interactive setup requires a TTY.\n" +
      "Pass flags instead, e.g. proton mail setup --username you@proton.me --pass pass://Vault/Bridge",
  );

  writePlain("Proton Mail Bridge setup");
  writePlain(
    "Use the Bridge password from Bridge → Settings, not your Proton account password.",
  );

  const imapHost = await promptLine("IMAP host", DEFAULT_IMAP.host);
  const imapPort = parsePort(
    await promptLine("IMAP port", String(DEFAULT_IMAP.port)),
    "IMAP",
  )!;
  const imapTls = await promptYesNo("IMAP use TLS", DEFAULT_IMAP.tls);

  const smtpHost = await promptLine("SMTP host", DEFAULT_SMTP.host);
  const smtpPort = parsePort(
    await promptLine("SMTP port", String(DEFAULT_SMTP.port)),
    "SMTP",
  )!;
  const smtpTls = await promptYesNo("SMTP use TLS", DEFAULT_SMTP.tls);

  const username = await promptLine("Bridge username (email)");
  if (!username) {
    throw new CliError("Username is required.", "username_required");
  }
  const email = await promptLine("Display email (optional)", username);

  writePlain("");
  writePlain("Bridge password storage:");
  writePlain(`  1) Environment variable $PROTONMAIL_PASSWORD (default)`);
  writePlain(`  2) Proton Pass item (--pass pass://Vault/Item)`);
  writePlain(`  3) Password file path (0600 recommended)`);
  const storage = await promptLine("Choose 1/2/3", "1");

  let passwordPassRef: string | undefined;
  let passwordFile: string | undefined;

  if (storage === "2") {
    const passRef = await promptLine("Pass item ref (pass://Vault/Item)");
    if (!passRef.trim()) {
      throw new CliError("Pass item ref is required for option 2.", "pass_required");
    }
    passwordPassRef = normalizePassItemRef(passRef);
  } else if (storage === "3") {
    passwordFile = await promptLine("Password file path");
    if (!passwordFile.trim()) {
      throw new CliError("Password file path is required for option 3.", "file_required");
    }
  }

  return defaultMailConfig({
    imap: { host: imapHost, port: imapPort, tls: imapTls },
    smtp: { host: smtpHost, port: smtpPort, tls: smtpTls },
    username,
    email: email || username,
    passwordPassRef,
    passwordFile,
  });
}

function buildConfigFromFlags(options: SetupOptions): MailConfig {
  const username = options.username?.trim();
  if (!username) {
    throw new CliError(
      "Username is required.\nPass --username <email> for non-interactive setup.",
      "username_required",
    );
  }

  const imapPort = parsePort(options.imapPort, "IMAP") ?? DEFAULT_IMAP.port;
  const smtpPort = parsePort(options.smtpPort, "SMTP") ?? DEFAULT_SMTP.port;

  let passwordPassRef: string | undefined;
  if (options.pass?.trim()) {
    passwordPassRef = normalizePassItemRef(options.pass);
  }

  return defaultMailConfig({
    imap: {
      host: options.imapHost?.trim() || DEFAULT_IMAP.host,
      port: imapPort,
      tls: options.imapTls ?? DEFAULT_IMAP.tls,
    },
    smtp: {
      host: options.smtpHost?.trim() || DEFAULT_SMTP.host,
      port: smtpPort,
      tls: options.smtpTls ?? DEFAULT_SMTP.tls,
    },
    username,
    email: options.email?.trim() || username,
    passwordPassRef,
    passwordFile: options.passwordFile?.trim() || undefined,
  });
}

/** Interactive setup for CLI and nested TUI (readline prompts). */
export async function configureMailInteractive(): Promise<MailConfig> {
  const config = await runInteractiveSetup();
  await saveMailConfig(config);
  return config;
}

export function registerSetup(mail: Command): void {
  addOutputOption(
    mail
      .command("setup")
      .description("Configure Proton Mail Bridge IMAP/SMTP settings")
      .option("--imap-host <host>", "IMAP host")
      .option("--imap-port <port>", "IMAP port")
      .option("--no-imap-tls", "Disable IMAP TLS")
      .option("--smtp-host <host>", "SMTP host")
      .option("--smtp-port <port>", "SMTP port")
      .option("--no-smtp-tls", "Disable SMTP TLS")
      .option("--username <email>", "Bridge IMAP/SMTP username")
      .option("--email <email>", "Display email (defaults to username)")
      .option(
        "--pass <ref>",
        "Store Proton Pass item ref for Bridge password (pass://Vault/Item)",
      )
      .option(
        "--password-file <path>",
        "Store path to a file containing the Bridge password",
      ),
  ).action(async (options: SetupOptions) => {
    try {
      const format = resolveOutputFormat(options.output);
      setCommandOutputFormat(format);

      const config =
        hasNonInteractiveFlags(options) || preferNonInteractive() || options.yes
          ? buildConfigFromFlags(options)
          : await runInteractiveSetup();

      await saveMailConfig(config);

      const payload = {
        ok: true,
        configDir: configDir(),
        imap: config.imap,
        smtp: config.smtp,
        username: config.username,
        email: config.email ?? config.username,
        passwordStorage: config.passwordPassRef
          ? { source: "pass", ref: config.passwordPassRef }
          : config.passwordFile
            ? { source: "file", path: config.passwordFile }
            : { source: "env", env: "PROTONMAIL_PASSWORD" },
      };

      if (format === "json") {
        writeJson(payload);
        return;
      }

      writePlain([
        "Mail Bridge settings saved.",
        `configDir\t${payload.configDir}`,
        `imap\t${config.imap.host}:${config.imap.port} tls=${config.imap.tls}`,
        `smtp\t${config.smtp.host}:${config.smtp.port} tls=${config.smtp.tls}`,
        `username\t${config.username}`,
        `password\tvia ${payload.passwordStorage.source}`,
      ]);
    } catch (error) {
      await handleCommandError(error);
    }
  });
}
