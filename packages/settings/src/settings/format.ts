import { listWritableMailKeys, MAIL_SETTING_SPECS } from "./keys.ts";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function intOf(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function intStr(value: unknown): string {
  return typeof value === "number" ? String(value) : "";
}

function onOff(value: number): string {
  return value === 1 ? "on" : "off";
}

function viewMode(value: number): string {
  return value === 0 ? "conversations" : "messages";
}

function printLine(lines: string[], label: string, value: string, width = 20): void {
  lines.push(`${`${label}:`.padEnd(width)} ${value}`);
}

export function formatAccountSettings(data: Record<string, unknown>): string {
  const userSettings = data.UserSettings;
  if (!userSettings || typeof userSettings !== "object") {
    return JSON.stringify(data, null, 2);
  }

  const settings = userSettings as Record<string, unknown>;
  const lines: string[] = [];

  printLine(lines, "Locale", str(settings.Locale), 16);

  const email = settings.Email;
  if (email && typeof email === "object") {
    printLine(lines, "Recovery Email", str((email as Record<string, unknown>).Value), 16);
  }

  const phone = settings.Phone;
  if (phone && typeof phone === "object") {
    printLine(lines, "Recovery Phone", str((phone as Record<string, unknown>).Value), 16);
  }

  printLine(lines, "Telemetry", intStr(settings.Telemetry), 16);
  printLine(lines, "CrashReports", intStr(settings.CrashReports), 16);

  const highSecurity = settings.HighSecurity;
  if (highSecurity && typeof highSecurity === "object") {
    const enabled = intOf((highSecurity as Record<string, unknown>).Value) === 1;
    printLine(lines, "High Security", enabled ? "on" : "off", 16);
  }

  return lines.join("\n");
}

export function formatMailSettings(data: Record<string, unknown>): string {
  const mailSettings = data.MailSettings;
  if (!mailSettings || typeof mailSettings !== "object") {
    return JSON.stringify(data, null, 2);
  }

  const settings = mailSettings as Record<string, unknown>;
  const lines: string[] = [];

  printLine(lines, "Display Name", str(settings.DisplayName));
  printLine(lines, "Page Size", intStr(settings.PageSize));
  printLine(lines, "View Mode", viewMode(intOf(settings.ViewMode)));
  printLine(lines, "Draft MIME Type", str(settings.DraftMIMEType));
  printLine(lines, "PM Signature", onOff(intOf(settings.PMSignature)));
  printLine(lines, "Auto Save Contacts", onOff(intOf(settings.AutoSaveContacts)));
  printLine(lines, "Hide Remote Images", onOff(intOf(settings.HideRemoteImages)));
  printLine(lines, "Sign Outgoing", onOff(intOf(settings.Sign)));
  printLine(lines, "Attach Public Key", onOff(intOf(settings.AttachPublicKey)));
  printLine(lines, "Shortcuts", onOff(intOf(settings.Shortcuts)));
  printLine(lines, "Delay Send", `${intOf(settings.DelaySendSeconds)}s`);

  return lines.join("\n");
}

export function formatWritableKeysList(): string {
  const lines = ["Available settings (settings set KEY VALUE):"];
  for (const key of listWritableMailKeys()) {
    lines.push(`  ${key.padEnd(22)} ${MAIL_SETTING_SPECS[key]?.description ?? ""}`);
  }
  return lines.join("\n");
}
