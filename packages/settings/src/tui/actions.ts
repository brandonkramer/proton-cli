import { configDir } from "../config/paths.ts";
import {
  getAccountSettings,
  getMailSettings,
  listWritableMailKeys,
  requireSettingsRuntime,
  updateMailSetting,
} from "../settings/client.ts";
import {
  formatAccountSettings,
  formatMailSettings,
  formatWritableKeysList,
} from "../settings/format.ts";
import { loadSession, signOut } from "../proton/auth.ts";
import { showMessage } from "../ui/message.tsx";
import { inkPromptText } from "../ui/prompts.tsx";
import { showStatus } from "../ui/status-view.tsx";
import { showTextView } from "../ui/text-view.tsx";
import { runTask } from "../ui/task.tsx";

export async function actionSignout(): Promise<void> {
  await signOut();
  await showMessage({
    variant: "success",
    title: "Signed out",
    body: "Settings session cleared.",
    holdMs: 700,
  });
}

export async function actionGetAccount(): Promise<void> {
  const text = await runTask({
    title: "Account settings",
    steps: [{ id: "fetch", label: "Fetching account settings" }],
    run: async (ui) => {
      ui.updateStep("fetch", { status: "running" });
      const runtime = await requireSettingsRuntime();
      const data = await getAccountSettings(runtime);
      ui.updateStep("fetch", { status: "done" });
      return formatAccountSettings(data);
    },
  });

  await showTextView({
    title: "Account settings",
    body: text,
    footer: "q / Esc close · CLI: `proton settings get --json`",
  });
}

export async function actionGetMail(): Promise<void> {
  const text = await runTask({
    title: "Mail settings",
    steps: [{ id: "fetch", label: "Fetching mail settings" }],
    run: async (ui) => {
      ui.updateStep("fetch", { status: "running" });
      const runtime = await requireSettingsRuntime();
      const data = await getMailSettings(runtime);
      ui.updateStep("fetch", { status: "done" });
      return formatMailSettings(data);
    },
  });

  await showTextView({
    title: "Mail settings",
    body: text,
    footer: "q / Esc close · CLI: `proton settings mail --json`",
  });
}

export async function actionListWritableKeys(): Promise<void> {
  const text = formatWritableKeysList();
  await showTextView({
    title: "Writable mail settings",
    body: text,
    footer: "q / Esc close · CLI: `proton settings set`",
  });
}

export async function actionUpdateSetting(): Promise<void> {
  const key = await inkPromptText("Setting key", {
    placeholder: "view-mode",
    hint: "Run List writable keys or `proton settings set` for allowed keys.",
  });
  const value = await inkPromptText("Setting value", {
    placeholder: "1",
    hint: `New value for ${key}`,
  });

  await runTask({
    title: "Update setting",
    steps: [{ id: "update", label: `Updating ${key}` }],
    run: async (ui) => {
      ui.updateStep("update", { status: "running" });
      const runtime = await requireSettingsRuntime();
      await updateMailSetting(runtime, key, value);
      ui.updateStep("update", { status: "done", detail: value });
    },
  });

  await showMessage({
    variant: "success",
    title: "Setting updated",
    body: `${key} = ${value}`,
    holdMs: 900,
  });
}

export async function actionStatus(): Promise<void> {
  const session = await loadSession();
  const writableKeyCount = listWritableMailKeys().length;

  await showStatus({
    signedIn: Boolean(session),
    username: session?.username,
    writableKeyCount,
    configDir: configDir(),
  });
}
