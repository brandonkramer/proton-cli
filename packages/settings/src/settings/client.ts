import { loadSession } from "../config/store.ts";
import { SETTINGS_ACCOUNT_PATH, SETTINGS_MAIL_PATH } from "../proton/constants.ts";
import { settingsApi } from "../proton/api.ts";
import type { Session } from "../proton/types.ts";
import { CliError } from "../util/errors.ts";
import {
  listWritableMailKeys,
  MAIL_SETTING_SPECS,
  parseMailSettingValue,
} from "./keys.ts";

export interface SettingsRuntime {
  session: Session;
  username: string;
  fetchImpl?: typeof fetch;
}

export async function requireSettingsRuntime(
  fetchImpl?: typeof fetch,
): Promise<SettingsRuntime> {
  const saved = await loadSession();
  if (!saved) {
    throw new CliError(
      "Not signed in — use proton signin --products settings",
    );
  }
  return {
    session: saved.session,
    username: saved.username,
    fetchImpl,
  };
}

export async function getAccountSettings(
  runtime: SettingsRuntime,
): Promise<Record<string, unknown>> {
  const data = await settingsApi<Record<string, unknown>>(SETTINGS_ACCOUNT_PATH, {
    method: "GET",
    session: runtime.session,
    fetchImpl: runtime.fetchImpl,
  });
  return data;
}

export async function getMailSettings(
  runtime: SettingsRuntime,
): Promise<Record<string, unknown>> {
  const data = await settingsApi<Record<string, unknown>>(SETTINGS_MAIL_PATH, {
    method: "GET",
    session: runtime.session,
    fetchImpl: runtime.fetchImpl,
  });
  return data;
}

export async function updateMailSetting(
  runtime: SettingsRuntime,
  key: string,
  value: string,
): Promise<{ key: string; value: string; path: string }> {
  const spec = MAIL_SETTING_SPECS[key];
  if (!spec) {
    throw new CliError(
      `unknown setting ${JSON.stringify(key)}; run \`proton settings set\` with no args to list keys`,
    );
  }

  let body: Record<string, string | number>;
  try {
    body = parseMailSettingValue(key, value);
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error));
  }

  await settingsApi(spec.path, {
    method: "PUT",
    body,
    session: runtime.session,
    fetchImpl: runtime.fetchImpl,
  });

  return { key, value, path: spec.path };
}

export { listWritableMailKeys, parseMailSettingValue, MAIL_SETTING_SPECS };
