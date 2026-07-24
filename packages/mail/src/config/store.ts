import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import {
  defaultMailConfig,
  parseMailConfig,
  type MailConfig,
} from "./schema.ts";
import { configDir, configPath } from "./paths.ts";

async function ensureConfigDir(): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  try {
    await chmod(configDir(), 0o700);
  } catch {
    // Windows may ignore mode bits.
  }
}

async function writeSecureJson(path: string, value: unknown): Promise<void> {
  await ensureConfigDir();
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  try {
    await chmod(path, 0o600);
  } catch {
    // Windows may ignore mode bits.
  }
}

export async function saveMailConfig(config: MailConfig): Promise<void> {
  const payload: MailConfig = {
    version: 1,
    imap: config.imap,
    smtp: config.smtp,
    username: config.username.trim(),
    ...(config.email?.trim() ? { email: config.email.trim() } : {}),
    ...(config.passwordPassRef?.trim()
      ? { passwordPassRef: config.passwordPassRef.trim() }
      : {}),
    ...(config.passwordFile?.trim()
      ? { passwordFile: config.passwordFile.trim() }
      : {}),
  };
  await writeSecureJson(configPath(), payload);
}

export async function loadMailConfig(): Promise<MailConfig | null> {
  try {
    const raw = await readFile(configPath(), "utf8");
    return parseMailConfig(JSON.parse(raw) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadMailConfigOrDefaults(): Promise<MailConfig> {
  const saved = await loadMailConfig();
  return saved ?? defaultMailConfig();
}
