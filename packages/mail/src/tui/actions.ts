import type { ComposeAction } from "../crypto/mime.ts";
import { configDir } from "../config/paths.ts";
import { requireMailRuntime } from "../context.ts";
import { loadSession, signOut } from "../proton/auth.ts";
import {
  getAndDecryptMessage,
  listMessagesForCommand,
  searchMessages,
  type DecryptedMessage,
} from "../service/messages.ts";
import {
  sendMail,
  type ComposeInput,
  type SendResult,
} from "../service/send.ts";
import {
  pickMessage,
  showMessageDetail,
  showMessageList,
} from "../ui/list-view.tsx";
import { showMessage } from "../ui/message.tsx";
import {
  inkPromptOptionalText,
  inkPromptSelect,
  inkPromptText,
} from "../ui/prompts.tsx";
import { showStatus } from "../ui/status-view.tsx";
import { runTask } from "../ui/task.tsx";
import { resolveAccountPassword } from "../util/password.ts";

export async function actionSignout(): Promise<void> {
  await signOut();
  await showMessage({
    variant: "success",
    title: "Signed out",
    body: "Mail session cleared.",
    holdMs: 700,
  });
}

export async function actionListInbox(): Promise<void> {
  const result = await runTask({
    title: "Inbox",
    steps: [
      { id: "session", label: "Loading session" },
      { id: "fetch", label: "Fetching messages" },
    ],
    run: async (ui) => {
      ui.updateStep("session", { status: "running" });
      const runtime = await requireMailRuntime();
      ui.updateStep("session", { status: "done" });
      ui.updateStep("fetch", { status: "running" });
      const page = await listMessagesForCommand({
        session: runtime.session,
        labelId: "inbox",
      });
      ui.updateStep("fetch", {
        status: "done",
        detail: `${page.messages.length}/${page.total}`,
      });
      return page;
    },
  });

  const picked = await pickMessage("Inbox", result.messages);
  if (picked) {
    await actionRead(picked);
  }
}

export async function actionSearch(): Promise<void> {
  const query = await inkPromptText("Search mail", {
    placeholder: "keyword",
    hint: "Server-side keyword search",
  });

  const result = await runTask({
    title: "Search",
    steps: [
      { id: "session", label: "Loading session" },
      { id: "fetch", label: "Searching" },
    ],
    note: query,
    run: async (ui) => {
      ui.updateStep("session", { status: "running" });
      const runtime = await requireMailRuntime();
      ui.updateStep("session", { status: "done" });
      ui.updateStep("fetch", { status: "running" });
      const page = await searchMessages({
        session: runtime.session,
        query,
      });
      ui.updateStep("fetch", {
        status: "done",
        detail: `${page.messages.length}/${page.total}`,
      });
      return page;
    },
  });

  if (result.messages.length === 0) {
    await showMessageList(`Search: ${query}`, result.messages);
    return;
  }

  const picked = await pickMessage(`Search: ${query}`, result.messages);
  if (picked) {
    await actionRead(picked);
  }
}

async function promptComposeFields(options: {
  action: ComposeAction;
  message?: DecryptedMessage;
}): Promise<ComposeInput | null> {
  const { action, message } = options;

  let to: string[] | undefined;
  let subject: string | undefined;

  if (action === "send" || action === "forward") {
    const toRaw = await inkPromptText("To", {
      placeholder: "you@example.com",
      hint: "Comma-separated addresses OK",
    });
    to = [toRaw];
  }

  if (action === "send") {
    subject = await inkPromptText("Subject", {
      placeholder: "Subject",
    });
  } else if (message) {
    const defaultSubject =
      action === "forward"
        ? message.subject.startsWith("Fwd:")
          ? message.subject
          : `Fwd: ${message.subject}`
        : message.subject.startsWith("Re:")
          ? message.subject
          : `Re: ${message.subject}`;
    const subjectRaw = await inkPromptOptionalText("Subject", {
      defaultValue: defaultSubject,
      hint: "Leave as-is or edit · Enter accepts",
    });
    subject = subjectRaw || defaultSubject;
  }

  const ccRaw = await inkPromptOptionalText("Cc", {
    placeholder: "(optional)",
  });
  const body = await inkPromptOptionalText("Body", {
    placeholder: "Message text (single line)",
    hint:
      action === "reply" || action === "reply-all" || action === "forward"
        ? "Your note — quoted original is appended automatically"
        : "Plain text body",
  });

  const summaryParts = [
    `Action: ${action}`,
    to ? `To: ${to.join(", ")}` : message ? `To: (from original)` : null,
    ccRaw ? `Cc: ${ccRaw}` : null,
    subject ? `Subject: ${subject}` : null,
    `Body: ${body ? `${body.slice(0, 60)}${body.length > 60 ? "…" : ""}` : "(empty)"}`,
  ].filter(Boolean);

  const confirm = await inkPromptSelect(
    "Send message?",
    [
      { label: "Send", value: "send" },
      { label: "Cancel", value: "cancel" },
    ],
    summaryParts.join(" · "),
  );
  if (confirm !== "send") return null;

  return {
    action,
    to,
    cc: ccRaw ? [ccRaw] : undefined,
    subject,
    body,
    messageId: message?.id,
  };
}

async function runSendFlow(input: ComposeInput): Promise<void> {
  const password = await resolveAccountPassword({});
  const result = await runTask({
    title:
      input.action === "send"
        ? "Send message"
        : input.action === "forward"
          ? "Forward message"
          : "Reply",
    steps: [
      { id: "unlock", label: "Unlocking keys" },
      { id: "send", label: "Encrypting and sending" },
    ],
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      const runtime = await requireMailRuntime({ unlockKeys: true, password });
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("send", { status: "running" });
      const sent = await sendMail(input, {
        session: runtime.session,
        password,
        username: runtime.username,
        addressKeys: runtime.addressKeys,
        addresses: runtime.addresses,
      });
      ui.updateStep("send", { status: "done" });
      return sent;
    },
  });

  if ("dryRun" in result && result.dryRun) {
    await showMessage({
      variant: "info",
      title: "Dry run",
      body: `Would ${result.action} to ${result.to.join(", ") || "(none)"}`,
      holdMs: 1200,
    });
    return;
  }

  const sent = result as SendResult;
  await showMessage({
    variant: "success",
    title: "Sent",
    body: `${sent.subject} → ${sent.to.join(", ") || "(recipients)"}`,
    holdMs: 1200,
  });
}

export async function actionCompose(): Promise<void> {
  const input = await promptComposeFields({ action: "send" });
  if (!input) {
    await showMessage({
      variant: "info",
      title: "Cancelled",
      body: "Message not sent.",
      holdMs: 700,
    });
    return;
  }
  await runSendFlow(input);
}

export async function actionRead(messageId: string): Promise<void> {
  // Prompt outside the task spinner so Ink UIs do not stack.
  const password = await resolveAccountPassword({});

  const message = await runTask({
    title: "Read message",
    steps: [
      { id: "unlock", label: "Unlocking keys" },
      { id: "fetch", label: "Decrypting message" },
    ],
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      const runtime = await requireMailRuntime({ unlockKeys: true, password });
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("fetch", { status: "running" });
      const decrypted = await getAndDecryptMessage({
        session: runtime.session,
        messageId,
        password,
        username: runtime.username,
        addressKeys: runtime.addressKeys,
      });
      ui.updateStep("fetch", { status: "done" });
      return decrypted;
    },
  });

  const next = await showMessageDetail(message);
  if (next === "close") return;

  const input = await promptComposeFields({
    action: next,
    message,
  });
  if (!input) {
    await showMessage({
      variant: "info",
      title: "Cancelled",
      body: "Message not sent.",
      holdMs: 700,
    });
    return;
  }
  await runSendFlow(input);
}

export async function actionStatus(): Promise<void> {
  const session = await loadSession();
  let inboxCount: number | null = null;
  let inboxTotal: number | null = null;

  if (session) {
    try {
      const runtime = await requireMailRuntime();
      const page = await listMessagesForCommand({
        session: runtime.session,
        labelId: "inbox",
        pageSize: 1,
      });
      inboxTotal = page.total;
      inboxCount = page.total;
    } catch {
      // Status screen still useful when fetch fails.
    }
  }

  await showStatus({
    signedIn: Boolean(session),
    username: session?.username,
    inboxCount,
    inboxTotal,
    configDir: configDir(),
  });
}
