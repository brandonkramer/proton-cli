import { loadMailConfig } from "../config/store.ts";
import {
  passwordStatusFromConfig,
  resolveBridgePassword,
} from "../config/password.ts";
import {
  buildStatusPayload,
} from "../commands/status.ts";
import { withImapSession } from "../imap/client.ts";
import { listMailboxMessages } from "../imap/messages.ts";
import { probeImap, probeSmtp } from "../util/connectivity.ts";
import { CliError } from "../util/errors.ts";
import { showInbox } from "../ui/inbox-view.tsx";
import { showMessage } from "../ui/message.tsx";
import { showStatus } from "../ui/status-view.tsx";
import { runTask } from "../ui/task.tsx";
import { configureMailInteractive } from "../commands/setup.ts";

export async function loadHomeSnapshot(): Promise<ReturnType<typeof buildStatusPayload>> {
  const config = await loadMailConfig();
  return buildStatusPayload(config);
}

export async function actionSetup(): Promise<void> {
  await runTask({
    title: "Setup",
    steps: [{ id: "save", label: "Saving Bridge settings" }],
    note: "Use the Bridge password from Bridge → Settings, not your account password.",
    run: async (ui) => {
      ui.updateStep("save", { status: "running" });
      const config = await configureMailInteractive();
      ui.updateStep("save", {
        status: "done",
        detail: config.username,
      });
      ui.setResult({
        variant: "success",
        title: "Settings saved",
        body: "Set PROTONMAIL_PASSWORD or Pass/file if you chose env storage.",
      });
      return config;
    },
  });
}

export async function actionDoctor(): Promise<void> {
  await runTask({
    title: "Doctor",
    steps: [
      { id: "config", label: "Checking config" },
      { id: "imap", label: "Probing IMAP" },
      { id: "smtp", label: "Probing SMTP" },
    ],
    run: async (ui) => {
      const config = await loadMailConfig();
      if (!config) {
        throw new CliError(
          "Mail is not configured.\nRun Setup or `proton mail setup` first.",
          "config_missing",
        );
      }

      ui.updateStep("config", { status: "running" });
      const passwordStatus = passwordStatusFromConfig(config);
      if (!passwordStatus.configured) {
        throw new CliError(
          "Bridge password is not configured.\n" +
            "Set PROTONMAIL_PASSWORD, PROTONMAIL_PASS, or configure Pass/file in setup.",
          "password_missing",
        );
      }
      const password = await resolveBridgePassword(config);
      if (!password) {
        throw new CliError(
          "Bridge password could not be resolved.",
          "password_missing",
        );
      }
      void password;
      ui.updateStep("config", { status: "done" });

      ui.updateStep("imap", { status: "running" });
      const imap = await probeImap(config.imap);
      ui.updateStep("imap", {
        status: imap.ok ? "done" : "error",
        detail: imap.message.split("\n")[0],
      });

      ui.updateStep("smtp", { status: "running" });
      const smtp = await probeSmtp(config.smtp);
      ui.updateStep("smtp", {
        status: smtp.ok ? "done" : "error",
        detail: smtp.message.split("\n")[0],
      });

      const ok = imap.ok && smtp.ok;
      ui.setResult({
        variant: ok ? "success" : "warning",
        title: ok ? "Bridge reachable" : "Bridge check failed",
        body: ok
          ? "IMAP and SMTP responded."
          : imap.ok
            ? smtp.message.split("\n")[0]
            : imap.message.split("\n")[0],
      });

      return ok;
    },
  });
}

export async function actionStatus(): Promise<void> {
  const config = await loadMailConfig();
  await showStatus(buildStatusPayload(config));
}

export async function actionInbox(): Promise<void> {
  const config = await loadMailConfig();
  const snap = buildStatusPayload(config);
  if (!snap.ok) {
    throw new CliError(
      snap.configured
        ? "Bridge password missing. Run Setup or set PROTONMAIL_PASSWORD."
        : "Mail is not configured. Run Setup or `proton mail setup` first.",
      "config_missing",
    );
  }

  const messages = await runTask({
    title: "Inbox",
    steps: [{ id: "fetch", label: "Fetching INBOX" }],
    run: async (ui) => {
      ui.updateStep("fetch", { status: "running" });
      const items = await withImapSession((client) =>
        listMailboxMessages(client, "INBOX", 20),
      );
      ui.updateStep("fetch", {
        status: "done",
        detail: `${items.length} messages`,
      });
      return items;
    },
  });

  await showInbox(messages);
}

export async function actionSendInfo(): Promise<void> {
  await showMessage({
    variant: "info",
    title: "Send via CLI",
    body:
      "Use `proton mail send`, `reply`, or `forward` with --dry-run first.\n" +
      "Agent safety: PROTONMAIL_READ_ONLY, PROTONMAIL_ALLOW_SEND, PROTONMAIL_CONFIRM_DESTRUCTIVE.",
    holdMs: 2400,
  });
}
